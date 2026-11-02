import type { ChannelOption, ChannelOptionStatus, LpfChannelSnapshot } from '../types/channels';
import { readLpfCache, updateLpfCache } from './lpfCacheStore';
import { LPF_SAVED_LINK_MAX_AGE_MS, type LpfActiveCacheRecord, type LpfCacheSnapshot, type LpfCacheUpdate } from './lpfCacheTypes';
import { inspectLpfPlaylist } from './lpfPlaylist';
import { fetchLpfPlaylist } from './lpfTransport';
import { getLpfSourceUrl, isLpfCdnUrl, LPF_OPTION_COUNT } from './lpfUrls';

const CACHE_READ_ERROR = 'Saved LPF links could not be loaded.';
const CACHE_WRITE_ERROR = 'Saved LPF links could not be updated.';
const REVALIDATION_TIMEOUT_MS = 8_000;
const REVALIDATION_CONCURRENCY = 6;
const MAX_CLOCK_SKEW_MS = 120_000;

function canonicalOption(option: ChannelOption, number: number, status: ChannelOptionStatus = 'unavailable'): ChannelOption {
  const sourceUrl = getLpfSourceUrl(number);
  return {
    ...option, iframe: sourceUrl, sourceUrl, status,
    lpf: status === 'unavailable' && option.lpf
      ? { resolution: option.lpf.resolution, origin: 'provider' }
      : option.lpf,
  };
}

function isFresh(record: LpfActiveCacheRecord, now: number): boolean {
  const age = now - record.resolvedAt;
  return Number.isSafeInteger(record.resolvedAt) && record.resolvedAt > 0
    && age >= -MAX_CLOCK_SKEW_MS && age < LPF_SAVED_LINK_MAX_AGE_MS;
}

/** Inspect only saved CDN playlists, sharing both work and the eight-second deadline. */
async function inspectSavedLinks(urls: readonly string[], signal: AbortSignal): Promise<Map<string, ChannelOptionStatus>> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(REVALIDATION_TIMEOUT_MS)]);
  const results = new Map<string, ChannelOptionStatus>();
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      if (deadline.aborted) {
        results.set(url, 'unavailable');
        continue;
      }
      results.set(url, await inspectLpfPlaylist(url, destination => fetchLpfPlaylist(destination, deadline)));
    }
  }
  await Promise.all(Array.from({ length: Math.min(REVALIDATION_CONCURRENCY, urls.length) }, worker));
  return results;
}

/** Durable last-known-good links supplement failures, never authoritative empty/replaced slots. */
export async function resolveLpfWithFallback(
  resolvePrimary: () => Promise<LpfChannelSnapshot>,
  observedAt: number,
  signal: AbortSignal,
): Promise<LpfChannelSnapshot> {
  // Attach the rejection handler immediately: primary lookup may outlast a failed Blob read.
  const cacheRead = readLpfCache(signal).then(
    cache => ({ cache, failed: false as const }),
    () => ({ cache: undefined, failed: true as const }),
  );
  const [primary, loaded] = await Promise.all([resolvePrimary(), cacheRead]);
  const options: ChannelOption[] = primary.channel.options.map(option => ({ ...option, lpf: option.lpf && { ...option.lpf } }));
  const updates: LpfCacheUpdate[] = [];
  const saved = new Map<number, LpfActiveCacheRecord>();
  const urls = new Set<string>();
  const now = Date.now();

  for (let index = 0; index < Math.min(options.length, LPF_OPTION_COUNT); index++) {
    const option = options[index];
    const number = index + 1;
    const prior = loaded.cache?.options[String(number)];
    const resolution = option.lpf?.resolution;
    if (resolution === 'empty') {
      options[index] = canonicalOption(option, number);
      updates.push({ option: number, record: { kind: 'retired', observedAt, reason: 'empty' } });
    } else if (resolution === 'resolved') {
      if (!isLpfCdnUrl(option.iframe)) {
        options[index] = canonicalOption(option, number);
        continue;
      }
      if (option.status === 'ended') {
        options[index] = canonicalOption(option, number, 'ended');
        updates.push({ option: number, record: { kind: 'retired', observedAt, reason: 'ended' } });
      } else if (option.status === 'live') {
        const resolvedAt = Math.max(now, observedAt);
        option.lpf = { resolution: 'resolved', origin: 'provider', resolvedAt, verifiedAt: resolvedAt };
        updates.push({
          option: number,
          record: { kind: 'active', url: option.iframe, observedAt, resolvedAt, verifiedAt: resolvedAt },
        });
      } else if (prior?.kind === 'active' && prior.url !== option.iframe) {
        updates.push({ option: number, record: { kind: 'retired', observedAt, reason: 'replaced' } });
      } else if (option.status === 'unavailable' && prior?.kind === 'active' && prior.url === option.iframe && isFresh(prior, now)) {
        // The provider resolved this URL; its CDN check was already attempted.
        // Retain its last verified provenance without a duplicate request.
        option.status = 'unknown';
        option.lpf = { resolution: 'resolved', origin: 'saved', resolvedAt: prior.resolvedAt, verifiedAt: prior.verifiedAt };
      }
    } else {
      // Missing outcome metadata is not authority to retire or to use a saved link.
      options[index] = canonicalOption(option, number);
      if (resolution !== 'failed' || prior?.kind !== 'active') continue;
      if (!isLpfCdnUrl(prior.url) || prior.url.length > 2048) continue;
      const expected = { observedAt: prior.observedAt, url: prior.url };
      if (!isFresh(prior, now)) {
        updates.push({ option: number, expected, record: { kind: 'retired', observedAt: Math.max(observedAt, prior.observedAt), reason: 'expired' } });
        continue;
      }
      saved.set(index, prior);
      urls.add(prior.url);
    }
  }

  const inspections = await inspectSavedLinks([...urls], signal);
  for (const [index, record] of saved) {
    const status = inspections.get(record.url) ?? 'unavailable';
    const verifiedAt = status === 'live' ? Math.max(Date.now(), record.verifiedAt) : record.verifiedAt;
    const option = options[index];
    options[index] = {
      ...option,
      iframe: status === 'ended' ? getLpfSourceUrl(index + 1) : record.url,
      status: status === 'unavailable' ? 'unknown' : status,
      lpf: { resolution: 'failed', origin: 'saved', resolvedAt: record.resolvedAt, verifiedAt },
    };
    const expected = { observedAt: record.observedAt, url: record.url };
    if (status === 'live') {
      updates.push({ option: index + 1, expected, record: { ...record, verifiedAt: Math.max(record.verifiedAt, verifiedAt) } });
    } else if (status === 'ended') {
      updates.push({ option: index + 1, expected, record: { kind: 'retired', observedAt: Math.max(observedAt, record.observedAt), reason: 'ended' } });
    }
  }

  let latest: LpfCacheSnapshot | undefined = loaded.cache;
  let writeFailed = false;
  if (updates.length || loaded.cache) {
    try {
      // Even an empty update rereads durable state, closing the read/inspection race.
      latest = await updateLpfCache(updates, signal);
      const replacements: LpfCacheUpdate[] = [];
      for (let index = 0; index < Math.min(options.length, LPF_OPTION_COUNT); index++) {
        const option = options[index];
        const current = latest.options[String(index + 1)];
        // A previous lookup may have saved a destination after our initial read.
        // Retire that old game without touching a newer lookup or a same-URL save.
        if (option.lpf?.resolution === 'resolved' && isLpfCdnUrl(option.iframe)
          && option.status !== 'live' && current?.kind === 'active'
          && current.url !== option.iframe && current.observedAt <= observedAt) {
          replacements.push({
            option: index + 1,
            expected: { observedAt: current.observedAt, url: current.url },
            record: { kind: 'retired', observedAt, reason: 'replaced' },
          });
        }
      }
      if (replacements.length) latest = await updateLpfCache(replacements, signal);
    } catch {
      writeFailed = true;
    }
  }

  if (latest) {
    for (let index = 0; index < Math.min(options.length, LPF_OPTION_COUNT); index++) {
      const option = options[index];
      const record = latest.options[String(index + 1)];
      if (option.status === 'ended' && (option.lpf?.origin === 'saved' || option.lpf?.resolution === 'resolved')) {
        const checkedRecord = saved.get(index);
        const checkedAt = checkedRecord?.observedAt ?? observedAt;
        const superseded = record && (record.observedAt > checkedAt
          || (record.observedAt === checkedAt && (record.kind === 'retired'
            ? record.reason !== 'ended'
            : record.url !== (checkedRecord?.url ?? primary.channel.options[index].iframe))));
        if (superseded) {
          options[index] = canonicalOption(option, index + 1, record.kind === 'retired' && record.reason === 'ended' ? 'ended' : 'unavailable');
        }
        continue;
      }
      if (!isLpfCdnUrl(option.iframe)) continue;
      let stale = false;
      if (option.lpf?.origin === 'saved') {
        stale = record?.kind !== 'active' || record.url !== option.iframe || !isFresh(record, Date.now());
      } else if (option.lpf?.resolution === 'resolved' && record) {
        // A same-time retirement beats an active writer; an own replacement
        // tombstone still permits the newly resolved (but unverified) destination.
        stale = record.observedAt >= observedAt && (record.kind === 'active'
          ? record.url !== option.iframe
          : option.status === 'live' || record.observedAt > observedAt || record.reason !== 'replaced');
      }
      if (stale) {
        options[index] = canonicalOption(option, index + 1, record?.kind === 'retired' && record.reason === 'ended' ? 'ended' : 'unavailable');
      }
    }
  }

  // Storage failure must not extend the maximum age while network work was pending.
  for (const [index, record] of saved) {
    if (!isFresh(record, Date.now()) && options[index].status !== 'ended') {
      options[index] = canonicalOption(options[index], index + 1);
    }
  }

  const cacheErrors = [primary.cacheError, loaded.failed ? CACHE_READ_ERROR : undefined, writeFailed ? CACHE_WRITE_ERROR : undefined].filter(Boolean);
  return {
    ...primary,
    channel: { ...primary.channel, options },
    ...(cacheErrors.length ? { cacheError: cacheErrors.join(' ') } : {}),
  };
}
