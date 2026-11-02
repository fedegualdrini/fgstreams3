import type { ChannelOption, ChannelOptionStatus, LpfChannelSnapshot } from '@/types/channels';
import type { ImpitResponse } from 'impit';
import { setTimeout as delay } from 'node:timers/promises';
import { Impit } from 'impit';
import { inspectLpfPlaylist } from './lpfPlaylist';
import { getRelayLpfSnapshot } from './lpfRelay';
import { resolveLpfWithFallback } from './lpfFallback';
import { fetchLpfPlaylist, LPF_REQUEST_HEADERS, LPF_REQUEST_TIMEOUT_MS } from './lpfTransport';
import { getLpfSourceUrl, isLpfCdnUrl, LPF_OPTION_COUNT, LPF_REFRESH_INTERVAL_MS } from './lpfUrls';
import { createLogger } from './logger';

const log = createLogger('lpf');
// Credentials stay in the server environment; only provider entry points use this egress.
const proxyClient = process.env.LPF_PROXY_URL
  ? new Impit({ browser: 'chrome', proxyUrl: process.env.LPF_PROXY_URL, timeout: LPF_REQUEST_TIMEOUT_MS })
  : null;

interface ResolvedLpfPlaylist {
  url: string;
  status: ChannelOptionStatus;
}

let cached: LpfChannelSnapshot | undefined;
let cachedAt = 0;
let pending: Promise<LpfChannelSnapshot> | undefined;
let pendingForced = false;
let lastLookupStartedAt = 0;

function isConnectionReset(error: unknown): boolean {
  for (let depth = 0; depth < 5 && error instanceof Error; depth++) {
    if ('code' in error && (error.code === 'ECONNRESET' || error.code === 'UND_ERR_SOCKET')) return true;
    error = error.cause;
  }
  return false;
}

async function fetchSource(url: string, deadline: AbortSignal): Promise<Response | ImpitResponse> {
  for (let attempt = 0; ; attempt++) {
    deadline.throwIfAborted();
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(LPF_REQUEST_TIMEOUT_MS)]);
    try {
      const requestOptions = {
        redirect: 'manual' as const, headers: LPF_REQUEST_HEADERS,
        signal,
      };
      return proxyClient
        ? await proxyClient.fetch(url, requestOptions)
        : await fetch(url, { ...requestOptions, cache: 'no-store' });
    } catch (error) {
      // Retry a per-attempt timeout, but never extend or retry the shared deadline.
      if (deadline.aborted || attempt >= 6 || (!signal.aborted && !isConnectionReset(error))) throw error;
      await delay(Math.min(500 * 2 ** attempt, 2_500), undefined, { signal: deadline });
    }
  }
}


async function refreshLpfChannel(signal: AbortSignal): Promise<LpfChannelSnapshot> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
  const options: ChannelOption[] = new Array(LPF_OPTION_COUNT);
  const failures: number[] = [];
  const inspections = new Map<string, Promise<ResolvedLpfPlaylist>>();
  let nextOption = 1;

  async function resolveOptions() {
    while (nextOption <= LPF_OPTION_COUNT) {
      const number = nextOption++;
      const sourceUrl = getLpfSourceUrl(number);
      const option: ChannelOption = {
        name: `Option ${number}`, iframe: sourceUrl, sourceUrl, proxy: true, status: 'unavailable',
        lpf: { resolution: 'failed', origin: 'provider' },
      };
      options[number - 1] = option;
      try {
        const response = await fetchSource(sourceUrl, deadline);
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          // The provider uses an empty 302 Location when a numbered slot has no stream.
          if (!location) {
            option.lpf = { resolution: 'empty', origin: 'provider' };
            continue;
          }
          const destination = new URL(location, sourceUrl).href;
          if (!isLpfCdnUrl(destination)) throw new Error('Unsupported LPF destination');
          option.iframe = destination;
          option.lpf = { resolution: 'resolved', origin: 'provider', resolvedAt: Date.now() };
          let inspection = inspections.get(destination);
          if (!inspection) {
            let finalUrl = destination;
            inspection = inspectLpfPlaylist(destination, async url => {
              const playlist = await fetchLpfPlaylist(url, deadline);
              if (url === destination) finalUrl = playlist.url || destination;
              return playlist;
            }).then(status => ({ url: finalUrl, status }));
            inspections.set(destination, inspection);
          }
          const resolved = await inspection;
          option.iframe = resolved.url;
          option.status = resolved.status;
          if (resolved.status === 'live' || resolved.status === 'ended') option.lpf.verifiedAt = Date.now();
        } else {
          await response.body?.cancel();
          log.warn('numbered source rejected resolution', { option: number, status: response.status });
          failures.push(number);
        }
      } catch (error) {
        failures.push(number);
        log.warn(`option ${number} could not be resolved`, {
          transport: proxyClient ? 'proxy' : 'direct',
          error: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, resolveOptions));
  return {
    channel: { name: 'LPF', logo: '', show: true, source: 'lpf', options },
    checkedAt: Date.now(),
    ...(failures.length ? { error: `Could not refresh LPF links for options ${failures.sort((a, b) => a - b).join(', ')}.` } : {}),
  };
}

/** Automatic reads cache for one minute; manual refreshes bypass every resolver cache. */
export async function getLpfChannelSnapshot(force = false): Promise<LpfChannelSnapshot> {
  const relay = process.env.LPF_RELAY_URL;
  // A relay GET may return a cached PC snapshot. A manual POST must reach the PC,
  // where concurrent requests still share the actual provider lookup.
  if (pending && (!force || pendingForced || relay === undefined)) return pending;
  if (!force && cached && Date.now() - cachedAt < LPF_REFRESH_INTERVAL_MS) return cached;
  // Order forced lookups even when two requests start in the same millisecond.
  const observedAt = Math.max(Date.now(), lastLookupStartedAt + 1);
  lastLookupStartedAt = observedAt;
  const deadline = AbortSignal.timeout(55_000);
  const refresh = relay !== undefined
    ? resolveLpfWithFallback(
      () => getRelayLpfSnapshot(relay, force, deadline),
      observedAt,
      deadline,
    )
    : refreshLpfChannel(deadline);
  pending = refresh;
  pendingForced = force;
  try {
    const snapshot = await refresh;
    // A slower automatic relay response must not replace a forced refresh.
    if (pending === refresh) {
      cached = snapshot;
      // Use receipt time: a remote clock cannot make a snapshot or a failure sticky.
      cachedAt = Date.now();
    }
    return snapshot;
  } finally {
    if (pending === refresh) {
      pending = undefined;
      pendingForced = false;
    }
  }
}
