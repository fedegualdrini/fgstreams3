import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ChannelOption, LpfChannelSnapshot } from '../types/channels';
import type { LpfActiveCacheRecord, LpfCacheSnapshot, LpfCacheUpdate } from './lpfCacheTypes';
import { LPF_SAVED_LINK_MAX_AGE_MS } from './lpfCacheTypes';
import { getLpfSourceUrl } from './lpfUrls';
import { resolveLpfWithFallback } from './lpfFallback';

const store = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn() }));
vi.mock('./lpfCacheStore', () => ({ readLpfCache: store.read, updateLpfCache: store.update }));

const now = Date.parse('2026-10-25T18:00:00Z');
const oldGame = 'https://liveassets-a.encoders.immergo.tv/old/stream.m3u8';
const nextGame = 'https://liveassets-b.encoders.immergo.tv/new/master.m3u8';
let durable: LpfCacheSnapshot;
let fetchMock: Mock;

function active(url = oldGame, observedAt = now - 60_000): LpfActiveCacheRecord {
  return { kind: 'active', url, observedAt, resolvedAt: observedAt, verifiedAt: observedAt + 1 };
}

function primary(overrides: Record<number, Partial<ChannelOption>> = {}): LpfChannelSnapshot {
  return {
    checkedAt: now,
    error: 'LPF relay is temporarily unavailable.',
    channel: {
      name: 'LPF', logo: '', source: 'lpf', show: true,
      options: Array.from({ length: 18 }, (_, index): ChannelOption => ({
        name: `Option ${index + 1}`, iframe: getLpfSourceUrl(index + 1), sourceUrl: getLpfSourceUrl(index + 1),
        proxy: true, status: 'unavailable', lpf: { resolution: 'failed', origin: 'provider' },
        ...overrides[index + 1],
      })),
    },
  };
}

function resolved(url = oldGame, status: ChannelOption['status'] = 'live'): Partial<ChannelOption> {
  return { iframe: url, status, lpf: { resolution: 'resolved', origin: 'provider' } };
}

function livePlaylist() {
  return new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-PROGRAM-DATE-TIME:${new Date(Date.now() - 6000).toISOString()}\n#EXTINF:6,\nsegment.ts\n`);
}

function unknownPlaylist() {
  return new Response('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n');
}

function endedPlaylist() {
  return new Response('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST\n');
}

async function resolve(snapshot = primary(), observedAt = now) {
  return resolveLpfWithFallback(async () => snapshot, observedAt, new AbortController().signal);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  durable = { version: 1, options: {} };
  store.read.mockReset().mockImplementation(async () => structuredClone(durable));
  // This is only the persistence boundary. Store CAS/validation is covered by its own suite.
  store.update.mockReset().mockImplementation(async (updates: readonly LpfCacheUpdate[]) => {
    for (const update of updates) durable.options[String(update.option)] = structuredClone(update.record);
    return structuredClone(durable);
  });
  fetchMock = vi.fn(async () => livePlaylist());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('durable LPF fallback', () => {
  it('starts the private cache read and primary lookup concurrently', async () => {
    const cache = Promise.withResolvers<LpfCacheSnapshot>();
    const provider = Promise.withResolvers<LpfChannelSnapshot>();
    store.read.mockReturnValue(cache.promise);
    const resolvePrimary = vi.fn(() => provider.promise);
    const result = resolveLpfWithFallback(resolvePrimary, now, new AbortController().signal);
    expect(store.read).toHaveBeenCalledOnce();
    expect(resolvePrimary).toHaveBeenCalledOnce();
    provider.resolve(primary());
    cache.resolve(durable);
    await result;
  });

  it('serves a verified direct CDN after a fresh module load during a relay outage', async () => {
    durable.options['1'] = active();
    vi.resetModules();
    // A static import cannot exercise restarting with only the durable store.
    const freshProcess = await import('./lpfFallback');
    const snapshot = await freshProcess.resolveLpfWithFallback(async () => primary(), now, new AbortController().signal);
    expect(snapshot.channel.options[0]).toMatchObject({
      iframe: oldGame, sourceUrl: getLpfSourceUrl(1), status: 'live',
      lpf: { resolution: 'failed', origin: 'saved', resolvedAt: now - 60_000, verifiedAt: now },
    });
    expect(snapshot.error).toBe('LPF relay is temporarily unavailable.');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(oldGame);
    expect(durable.options['1']).toEqual({ ...active(), verifiedAt: now });
    expect(store.update.mock.calls[0][0]).toContainEqual({
      option: 1, expected: { observedAt: now - 60_000, url: oldGame },
      record: { ...active(), verifiedAt: now },
    });
  });

  it('keeps fresh primary results during a partial outage and deduplicates cloned saved URLs', async () => {
    durable.options = { '1': active(), '2': active(), '3': active() };
    const snapshot = await resolve(primary({ 3: resolved(nextGame) }));
    expect(snapshot.channel.options.slice(0, 3).map(option => [option.iframe, option.lpf?.origin])).toEqual([
      [oldGame, 'saved'], [oldGame, 'saved'], [nextGame, 'provider'],
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(durable.options['3']).toEqual({ kind: 'active', url: nextGame, observedAt: now, resolvedAt: now, verifiedAt: now });
  });

  it.each(['unknown', 'http', 'transport', 'malformed'] as const)('offers %s saved checks as unknown without inventing verification', async failure => {
    durable.options['1'] = active();
    if (failure === 'unknown') fetchMock.mockImplementation(async () => unknownPlaylist());
    if (failure === 'http') fetchMock.mockImplementation(async () => new Response('denied', { status: 403 }));
    if (failure === 'transport') fetchMock.mockRejectedValue(new Error('secret credential in transport'));
    if (failure === 'malformed') fetchMock.mockImplementation(async () => new Response('not HLS'));
    const snapshot = await resolve();
    expect(snapshot.channel.options[0]).toMatchObject({
      iframe: oldGame, status: 'unknown',
      lpf: { resolution: 'failed', origin: 'saved', resolvedAt: now - 60_000, verifiedAt: now - 59_999 },
    });
    expect(store.update.mock.calls[0][0]).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain('secret credential');
  });

  it('retains an unavailable same-URL primary destination as saved unknown without another CDN check', async () => {
    durable.options['1'] = active();
    const snapshot = await resolve(primary({ 1: resolved(oldGame, 'unavailable') }));
    expect(snapshot.channel.options[0]).toMatchObject({
      iframe: oldGame, status: 'unknown',
      lpf: { resolution: 'resolved', origin: 'saved', resolvedAt: now - 60_000, verifiedAt: now - 59_999 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(durable.options['1']).toEqual(active());
  });

  it('does not erase a same-URL unknown primary result or its previously verified record', async () => {
    durable.options['1'] = active();
    const snapshot = await resolve(primary({ 1: resolved(oldGame, 'unknown') }));
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: oldGame, status: 'unknown', lpf: { origin: 'provider' } });
    expect(durable.options['1']).toEqual(active());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['empty', 'ended'] as const)('persists authoritative %s retirement through subsequent failures', async outcome => {
    durable.options['1'] = active();
    const option = outcome === 'empty'
      ? { lpf: { resolution: 'empty' as const, origin: 'provider' as const } }
      : resolved(oldGame, 'ended');
    const retired = await resolve(primary({ 1: option }));
    expect(retired.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: outcome === 'ended' ? 'ended' : 'unavailable' });
    expect(durable.options['1']).toEqual({ kind: 'retired', observedAt: now, reason: outcome });
    const failed = await resolve(primary(), now + 1);
    expect(failed.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes empty tombstones even when no previous active record exists', async () => {
    await resolve(primary({ 1: { lpf: { resolution: 'empty', origin: 'provider' } } }));
    expect(durable.options['1']).toEqual({ kind: 'retired', observedAt: now, reason: 'empty' });
  });

  it.each(['unknown', 'unavailable'] as const)('retires the previous game when a replacement CDN is %s', async status => {
    durable.options['1'] = active();
    const snapshot = await resolve(primary({ 1: resolved(nextGame, status) }));
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: nextGame, status, lpf: { origin: 'provider' } });
    expect(durable.options['1']).toEqual({ kind: 'retired', observedAt: now, reason: 'replaced' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await resolve()).channel.options[0].iframe).toBe(getLpfSourceUrl(1));
  });

  it('never saves a never-verified unknown destination as active', async () => {
    await resolve(primary({ 1: resolved(nextGame, 'unknown') }));
    expect(durable.options['1']).toBeUndefined();
  });

  it('conditionally retires saved ENDLIST responses at the current lookup version', async () => {
    durable.options['1'] = active();
    fetchMock.mockImplementation(async () => endedPlaylist());
    const snapshot = await resolve();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'ended', lpf: { origin: 'saved' } });
    expect(store.update.mock.calls[0][0]).toContainEqual({
      option: 1, expected: { observedAt: now - 60_000, url: oldGame },
      record: { kind: 'retired', observedAt: now, reason: 'ended' },
    });
    expect((await resolve()).channel.options[0].iframe).toBe(getLpfSourceUrl(1));
  });

  it('expires saved links at the exact age boundary without fetching them', async () => {
    const record = active(oldGame, now - LPF_SAVED_LINK_MAX_AGE_MS);
    durable.options['1'] = record;
    const snapshot = await resolve();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.update.mock.calls[0][0]).toContainEqual({
      option: 1, expected: { observedAt: record.observedAt, url: oldGame },
      record: { kind: 'retired', observedAt: now, reason: 'expired' },
    });
  });

  it('prevents a delayed primary v15 from reviving saved v10 after an ended check at v20', async () => {
    const savedVersion = now - 10;
    const primaryVersion = now - 5;
    durable.options['1'] = active(oldGame, savedVersion);
    store.update.mockImplementation(async (updates: readonly LpfCacheUpdate[]) => {
      for (const update of updates) {
        const current = durable.options[String(update.option)];
        if (update.expected && (current?.kind !== 'active' || current.url !== update.expected.url
          || current.observedAt !== update.expected.observedAt)) continue;
        if (current && current.observedAt > update.record.observedAt) continue;
        durable.options[String(update.option)] = structuredClone(update.record);
      }
      return structuredClone(durable);
    });
    const delayed = Promise.withResolvers<LpfChannelSnapshot>();
    const primaryLookup = resolveLpfWithFallback(() => delayed.promise, primaryVersion, new AbortController().signal);
    fetchMock.mockImplementation(async () => endedPlaylist());
    const ended = await resolve(primary(), now);
    expect(ended.channel.options[0].status).toBe('ended');
    expect(durable.options['1']).toEqual({ kind: 'retired', observedAt: now, reason: 'ended' });
    expect(store.update.mock.calls[0][0]).toContainEqual({
      option: 1, expected: { observedAt: savedVersion, url: oldGame },
      record: { kind: 'retired', observedAt: now, reason: 'ended' },
    });
    delayed.resolve(primary({ 1: resolved(oldGame) }));
    expect((await primaryLookup).channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'ended' });
    expect(durable.options['1']).toEqual({ kind: 'retired', observedAt: now, reason: 'ended' });
    expect((await resolve()).channel.options[0].iframe).toBe(getLpfSourceUrl(1));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([120_000, 120_001])('bounds future saved resolution timestamps with %i milliseconds of skew', async skew => {
    durable.options['1'] = { ...active(), resolvedAt: now + skew, verifiedAt: now + skew };
    const snapshot = await resolve();
    if (skew <= 120_000) {
      expect(snapshot.channel.options[0]).toMatchObject({ iframe: oldGame, status: 'live', lpf: { origin: 'saved' } });
      expect(fetchMock).toHaveBeenCalledOnce();
    } else {
      expect(snapshot.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable', lpf: { origin: 'provider' } });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(durable.options['1']).toEqual({ kind: 'retired', observedAt: now, reason: 'expired' });
    }
  });

  it('clears saved-link provenance when a newer replacement suppresses the saved URL', async () => {
    durable.options['1'] = active();
    store.update.mockResolvedValue({ version: 1, options: { '1': active(nextGame, now + 1) } });
    const option = (await resolve()).channel.options[0];
    expect(option).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable', lpf: { resolution: 'failed', origin: 'provider' } });
    expect(option.lpf).not.toHaveProperty('resolvedAt');
    expect(option.lpf).not.toHaveProperty('verifiedAt');
  });

  it('uses local resolution/verification times rather than remote metadata', async () => {
    const option = resolved();
    option.lpf = { resolution: 'resolved', origin: 'provider', resolvedAt: now + 1_000_000, verifiedAt: now + 1_000_000 };
    await resolve(primary({ 1: option }), now - 10);
    expect(durable.options['1']).toEqual({ kind: 'active', url: oldGame, observedAt: now - 10, resolvedAt: now, verifiedAt: now });
  });

  it('keeps local timestamps at least the monotonically ordered lookup start', async () => {
    await resolve(primary({ 1: resolved() }), now + 1);
    expect(durable.options['1']).toEqual({ kind: 'active', url: oldGame, observedAt: now + 1, resolvedAt: now + 1, verifiedAt: now + 1 });
  });

  it('does not report an old saved game ended when its conditional retirement loses to a replacement', async () => {
    durable.options['1'] = active();
    fetchMock.mockImplementation(async () => endedPlaylist());
    store.update.mockResolvedValue({ version: 1, options: { '1': active(nextGame, now + 1) } });
    expect((await resolve()).channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable' });
  });

  it('does not mutate the primary resolver snapshot when supplementing saved data', async () => {
    durable.options['1'] = active();
    const snapshot = primary();
    const original = structuredClone(snapshot);
    await resolve(snapshot);
    expect(snapshot).toEqual(original);
  });

  it.each(['replacement', 'ended', 'empty', 'expired'] as const)('suppresses a saved verification that loses to a newer %s', async winner => {
    durable.options['1'] = active();
    store.update.mockImplementation(async () => ({
      version: 1,
      options: { '1': winner === 'replacement' ? active(nextGame, now + 1) : { kind: 'retired', observedAt: now + 1, reason: winner } },
    }));
    const snapshot = await resolve();
    expect(snapshot.channel.options[0]).toMatchObject({
      iframe: getLpfSourceUrl(1), status: winner === 'ended' ? 'ended' : 'unavailable',
    });
  });

  it('suppresses a stale fresh-primary URL when the commit returns a newer game', async () => {
    store.update.mockResolvedValue({ version: 1, options: { '1': active(nextGame, now + 1) } });
    const snapshot = await resolve(primary({ 1: resolved() }));
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('honors a same-time retirement that beats a primary live write', async () => {
    store.update.mockResolvedValue({ version: 1, options: { '1': { kind: 'retired', observedAt: now, reason: 'empty' } } });
    expect((await resolve(primary({ 1: resolved() }))).channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable' });
  });

  it('reconciles unknown saved checks too, even when there is no verification write', async () => {
    durable.options['1'] = active();
    fetchMock.mockImplementation(async () => unknownPlaylist());
    store.update.mockResolvedValue({ version: 1, options: { '1': { kind: 'retired', observedAt: now + 1, reason: 'ended' } } });
    expect((await resolve()).channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'ended' });
    expect(store.update.mock.calls[0][0]).toEqual([]);
  });

  it('retires an old game inserted between the initial read and replacement reconciliation', async () => {
    store.update.mockImplementationOnce(async () => ({ version: 1, options: { '1': active() } }));
    const snapshot = await resolve(primary({ 1: resolved(nextGame, 'unavailable') }));
    expect(store.update).toHaveBeenCalledTimes(2);
    expect(store.update.mock.calls[1][0]).toEqual([{
      option: 1, expected: { observedAt: now - 60_000, url: oldGame },
      record: { kind: 'retired', observedAt: now, reason: 'replaced' },
    }]);
    expect(snapshot.channel.options[0].iframe).toBe(nextGame);
  });

  it('does not override a newer retirement while reconciling a late replacement', async () => {
    store.update.mockResolvedValueOnce({ version: 1, options: { '1': active() } });
    store.update.mockResolvedValueOnce({ version: 1, options: { '1': { kind: 'retired', observedAt: now + 1, reason: 'empty' } } });
    expect((await resolve(primary({ 1: resolved(nextGame, 'unknown') }))).channel.options[0].iframe).toBe(getLpfSourceUrl(1));
  });

  it('keeps fresh primary results and a separate sanitized error when Blob reads fail', async () => {
    store.read.mockRejectedValue(new Error('BLOB_READ_WRITE_TOKEN=private https://secret.blob.vercel-storage.com/cache'));
    const snapshot = await resolve(primary({ 1: resolved() }));
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: oldGame, status: 'live' });
    expect(snapshot.error).toBe('LPF relay is temporarily unavailable.');
    expect(snapshot.cacheError).toBe('Saved LPF links could not be loaded.');
    expect(durable.options['1']).toMatchObject({ kind: 'active', url: oldGame });
    expect(JSON.stringify(snapshot)).not.toMatch(/BLOB_READ_WRITE_TOKEN|secret\.blob|private/);
  });

  it('reports write failure without hiding fresh results or pretending persistence succeeded', async () => {
    store.update.mockRejectedValue(new Error('authorization Bearer top-secret'));
    const snapshot = await resolve(primary({ 1: resolved() }));
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: oldGame, status: 'live' });
    expect(snapshot.cacheError).toBe('Saved LPF links could not be updated.');
    expect(snapshot.error).toBe('LPF relay is temporarily unavailable.');
    expect(durable.options['1']).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('top-secret');
  });

  it('still suppresses an already-known newer retirement if the write operation fails', async () => {
    durable.options['1'] = { kind: 'retired', observedAt: now + 1, reason: 'empty' };
    store.update.mockRejectedValue(new Error('storage unavailable'));
    const snapshot = await resolve(primary({ 1: resolved() }));
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'unavailable' });
    expect(snapshot.cacheError).toBe('Saved LPF links could not be updated.');
  });

  it('retains a directly observed saved ended result if retirement persistence fails', async () => {
    durable.options['1'] = active();
    fetchMock.mockImplementation(async () => endedPlaylist());
    store.update.mockRejectedValue(new Error('storage unavailable'));
    const snapshot = await resolve();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: getLpfSourceUrl(1), status: 'ended' });
    expect(snapshot.cacheError).toBe('Saved LPF links could not be updated.');
  });

  it('does not fetch unsafe saved URLs, provider entry points or segment media', async () => {
    durable.options = {
      '1': active('http://127.0.0.1/private.m3u8'),
      '2': active(getLpfSourceUrl(2)),
      '3': active(),
    };
    fetchMock.mockImplementation(async (url: string) => url === oldGame
      ? new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8\n')
      : livePlaylist());
    const snapshot = await resolve();
    expect(snapshot.channel.options[0].iframe).toBe(getLpfSourceUrl(1));
    expect(snapshot.channel.options[1].iframe).toBe(getLpfSourceUrl(2));
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      oldGame, 'https://liveassets-a.encoders.immergo.tv/old/variant.m3u8',
    ]);
  });

  it('blocks unsafe redirects from saved CDN URLs before fetching their destination', async () => {
    durable.options['1'] = active();
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private.m3u8' } }));
    expect((await resolve()).channel.options[0]).toMatchObject({ iframe: oldGame, status: 'unknown' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('limits shared saved-link inspection to six concurrent requests', async () => {
    let inFlight = 0;
    let maximum = 0;
    const gates = Array.from({ length: 18 }, () => Promise.withResolvers<void>());
    for (let number = 1; number <= 18; number++) durable.options[String(number)] = active(`https://liveassets-a.encoders.immergo.tv/${number}/stream.m3u8`);
    fetchMock.mockImplementation(async (url: string) => {
      inFlight++;
      maximum = Math.max(maximum, inFlight);
      const number = Number(new URL(url).pathname.split('/')[1]);
      await gates[number - 1].promise;
      inFlight--;
      return livePlaylist();
    });
    const started = resolve();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    for (const gate of gates) gate.resolve();
    await started;
    expect(maximum).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(18);
  });

  it('uses a single eight-second deadline and never starts queued fetches after it aborts', async () => {
    const controller = new AbortController();
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => milliseconds === 8000 ? controller.signal : realTimeout(milliseconds));
    for (let number = 1; number <= 18; number++) durable.options[String(number)] = active(`https://liveassets-a.encoders.immergo.tv/${number}/stream.m3u8`);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const request = Promise.withResolvers<Response>();
      init.signal!.addEventListener('abort', () => request.reject(new Error('network secret')), { once: true });
      return request.promise;
    });
    const started = resolve();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    controller.abort();
    const snapshot = await started;
    expect(timeout.mock.calls.filter(([milliseconds]) => milliseconds === 8000)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(snapshot.channel.options.every(option => option.status === 'unknown')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('network secret');
  });
});
