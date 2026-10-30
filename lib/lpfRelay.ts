import type { ChannelOption, ChannelOptionStatus, LpfChannelSnapshot } from '@/types/channels';
import { getLpfSourceUrl, isLpfCdnUrl, LPF_OPTION_COUNT } from './lpfUrls';

const STATUSES: readonly ChannelOptionStatus[] = ['live', 'ended', 'unavailable', 'unknown'];

function unavailable(error: string): LpfChannelSnapshot {
  return {
    channel: {
      name: 'LPF', logo: '', show: true, source: 'lpf',
      options: Array.from({ length: LPF_OPTION_COUNT }, (_, index) => {
        const sourceUrl = getLpfSourceUrl(index + 1);
        return { name: `Option ${index + 1}`, sourceUrl, iframe: sourceUrl, proxy: true, status: 'unavailable' };
      }),
    },
    checkedAt: Date.now(),
    error,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copy only trusted fields; neither remote errors nor extra fields may carry secrets or URLs to the browser. */
function validateSnapshot(value: unknown, token: string): LpfChannelSnapshot | undefined {
  if (!record(value) || typeof value.checkedAt !== 'number' || !Number.isFinite(value.checkedAt)
    || (value.error !== undefined && typeof value.error !== 'string')) return;
  const channel = value.channel;
  if (!record(channel) || channel.name !== 'LPF' || channel.source !== 'lpf'
    || channel.logo !== '' || channel.show !== true || !Array.isArray(channel.options)
    || channel.options.length !== LPF_OPTION_COUNT) return;
  const options: ChannelOption[] = [];
  for (let index = 0; index < LPF_OPTION_COUNT; index++) {
    const option: unknown = channel.options[index];
    const sourceUrl = getLpfSourceUrl(index + 1);
    if (!record(option) || option.name !== `Option ${index + 1}` || option.sourceUrl !== sourceUrl
      || option.proxy !== true || typeof option.iframe !== 'string'
      || !STATUSES.includes(option.status as ChannelOptionStatus)
      || option.iframe.includes(token)
      || (option.iframe !== sourceUrl && !isLpfCdnUrl(option.iframe))
      || (option.iframe === sourceUrl && option.status !== 'unavailable' && option.status !== 'unknown')) return;
    options.push({
      name: `Option ${index + 1}`, sourceUrl, iframe: option.iframe, proxy: true,
      status: option.status as ChannelOptionStatus,
    });
  }
  return {
    channel: { name: 'LPF', logo: '', show: true, source: 'lpf', options },
    checkedAt: value.checkedAt,
    ...(value.error ? { error: 'The PC relay could not refresh some LPF links.' } : {}),
  };
}

/** The endpoint comes exclusively from server configuration, never from a client request. */
export async function getRelayLpfSnapshot(endpoint: string, force = false): Promise<LpfChannelSnapshot> {
  const token = process.env.LPF_RELAY_TOKEN;
  if (!token?.trim()) return unavailable('LPF relay is unavailable: server authentication is not configured.');
  let url: URL;
  try {
    url = new URL(endpoint);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if (url.username || url.password || url.hash
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
      return unavailable('LPF relay is unavailable: unsafe server endpoint configuration.');
    }
  } catch {
    return unavailable('LPF relay is unavailable: invalid server endpoint configuration.');
  }
  try {
    const response = await fetch(url.href, {
      method: force ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(40_000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return unavailable(`LPF relay is unavailable: server returned HTTP ${response.status}.`);
    }
    const snapshot = validateSnapshot(await response.json(), token);
    return snapshot ?? unavailable('LPF relay is unavailable: invalid or untrusted snapshot.');
  } catch {
    // Transport/JSON exceptions can include the endpoint or credentials. Never forward their messages.
    return unavailable('LPF relay is unavailable: request failed or timed out.');
  }
}
