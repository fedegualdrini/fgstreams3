import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LpfChannelSnapshot } from '@/types/channels';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// All dynamic imports deliberately reload the module-level cache; static imports cannot isolate these cases.
const endpoint = 'https://pc-relay.example/lpf';
const token = 'private-relay-test-secret';
const now = Date.parse('2026-10-25T18:00:00Z');
const source = (number: number) => `https://emitiendoenvivo.com/lpf/${number}.m3u8`;
const oldGame = 'https://liveassets-a.encoders.immergo.tv/old/stream.m3u8';
const newGame = 'https://liveassets-b.encoders.immergo.tv/new/master.m3u8';

function remoteSnapshot(destination = oldGame): LpfChannelSnapshot {
  return {
    channel: {
      name: 'LPF', source: 'lpf', logo: '', show: true,
      options: Array.from({ length: 18 }, (_, index) => ({
        name: `Option ${index + 1}`, sourceUrl: source(index + 1), proxy: true,
        iframe: index < 2 ? destination : source(index + 1),
        status: index === 0 ? 'live' : index === 1 ? 'ended' : 'unavailable',
      })),
    },
    checkedAt: Date.now(),
  };
}

function expectUnavailable(snapshot: LpfChannelSnapshot) {
  expect(snapshot.error).toMatch(/LPF relay is unavailable:/);
  expect(snapshot.channel.options).toHaveLength(18);
  snapshot.channel.options.forEach((option, index) => {
    expect(option).toEqual({
      name: `Option ${index + 1}`, sourceUrl: source(index + 1), iframe: source(index + 1),
      proxy: true, status: 'unavailable',
    });
  });
  expect(JSON.stringify(snapshot)).not.toContain(token);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('LPF_RELAY_URL', endpoint);
  vi.stubEnv('LPF_RELAY_TOKEN', token);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LPF PC relay snapshots', () => {
  it('uses the relay exclusively, shares refresh work and replaces destinations and statuses after expiry', async () => {
    let snapshot = remoteSnapshot();
    const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => Response.json(snapshot));
    vi.stubGlobal('fetch', fetcher);
    // A fresh import is required to exercise the per-instance cache and singleflight boundary.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const [first, shared] = await Promise.all([getLpfChannelSnapshot(), getLpfChannelSnapshot()]);
    expect(shared).toBe(first);
    expect(first.channel.options[0]).toMatchObject({ iframe: oldGame, status: 'live' });
    expect(first.channel.options[1]).toMatchObject({ iframe: oldGame, status: 'ended' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    snapshot = remoteSnapshot(newGame);
    snapshot.channel.options[0].status = 'unknown';
    vi.setSystemTime(now + 60_001);
    const next = await getLpfChannelSnapshot();
    expect(next.channel.options[0]).toMatchObject({ iframe: newGame, status: 'unknown' });
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(fetcher.mock.calls.every(call => call[0] === endpoint)).toBe(true);
  });

  it('forces a PC lookup during an automatic relay read and never lets its older response overwrite the result', async () => {
    const automatic = Promise.withResolvers<Response>();
    const manual = Promise.withResolvers<Response>();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(remoteSnapshot()))
      .mockReturnValueOnce(automatic.promise)
      .mockReturnValueOnce(manual.promise);
    vi.stubGlobal('fetch', fetcher);
    const { getLpfChannelSnapshot } = await import('./lpf');
    expect((await getLpfChannelSnapshot()).channel.options[0].iframe).toBe(oldGame);
    vi.setSystemTime(now + 60_001);
    const automaticRead = getLpfChannelSnapshot();
    const forced = getLpfChannelSnapshot(true);
    const concurrentManual = getLpfChannelSnapshot(true);
    const concurrentAutomatic = getLpfChannelSnapshot();
    manual.resolve(Response.json(remoteSnapshot(newGame)));
    const [updated, sharedManual, sharedAutomatic] = await Promise.all([forced, concurrentManual, concurrentAutomatic]);
    expect(updated.channel.options[0].iframe).toBe(newGame);
    expect(sharedManual).toBe(updated);
    expect(sharedAutomatic).toBe(updated);
    automatic.resolve(Response.json(remoteSnapshot()));
    await automaticRead;
    expect(await getLpfChannelSnapshot()).toBe(updated);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not retain old playback on failure or cache remote future timestamps and failures beyond a minute', async () => {
    const future = remoteSnapshot();
    future.checkedAt = now + 86_400_000;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(future))
      .mockRejectedValueOnce(new Error(`${token}: ${endpoint}`))
      .mockResolvedValueOnce(Response.json(remoteSnapshot(newGame)));
    vi.stubGlobal('fetch', fetcher);
    // Dynamic import isolates the cache so a prior case cannot mask a refresh failure.
    const { getLpfChannelSnapshot } = await import('./lpf');
    expect((await getLpfChannelSnapshot()).channel.options[0].iframe).toBe(oldGame);
    vi.setSystemTime(now + 60_001);
    const failed = await getLpfChannelSnapshot();
    expectUnavailable(failed);
    expect(await getLpfChannelSnapshot()).toBe(failed);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now + 120_002);
    expect((await getLpfChannelSnapshot()).channel.options[0].iframe).toBe(newGame);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([undefined, ''])('fails closed without a configured secret (%s)', async secret => {
    vi.stubEnv('LPF_RELAY_TOKEN', secret);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { getLpfChannelSnapshot } = await import('./lpf');
    expectUnavailable(await getLpfChannelSnapshot());
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    '', 'not a URL', 'http://pc-relay.example/lpf',
    'https://user:password@pc-relay.example/lpf', 'https://pc-relay.example/lpf#fragment',
  ])('rejects unsafe server endpoint %s without network access', async unsafe => {
    vi.stubEnv('LPF_RELAY_URL', unsafe);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { getLpfChannelSnapshot } = await import('./lpf');
    expectUnavailable(await getLpfChannelSnapshot());
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a relay authentication rejection without exposing its body or resolving sources directly', async () => {
    const fetcher = vi.fn(async () => new Response(token, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    const { getLpfChannelSnapshot } = await import('./lpf');
    const snapshot = await getLpfChannelSnapshot();
    expectUnavailable(snapshot);
    expect(snapshot.error).toContain('HTTP 401');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['channel identity', (snapshot: LpfChannelSnapshot) => { snapshot.channel.name = 'Other'; }],
    ['channel source', (snapshot: LpfChannelSnapshot) => { snapshot.channel.source = 'other'; }],
    ['logo URL', (snapshot: LpfChannelSnapshot) => { snapshot.channel.logo = 'https://evil.example/logo'; }],
    ['count', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options.pop(); }],
    ['position', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options.reverse(); }],
    ['source URL', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options[0].sourceUrl = 'https://evil.example/a'; }],
    ['destination URL', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options[0].iframe = 'http://127.0.0.1/private'; }],
    ['CDN credentials', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options[0].iframe = 'https://user:pass@liveassets-a.encoders.immergo.tv/a.m3u8'; }],
    ['proxy flag', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options[0].proxy = false; }],
    ['status', (snapshot: LpfChannelSnapshot) => { Object.assign(snapshot.channel.options[0], { status: 'playing' }); }],
    ['unresolved live option', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options[0].iframe = source(1); }],
    ['timestamp', (snapshot: LpfChannelSnapshot) => { Object.assign(snapshot, { checkedAt: 'today' }); }],
    ['nonfinite timestamp', (snapshot: LpfChannelSnapshot) => { snapshot.checkedAt = Number.POSITIVE_INFINITY; }],
    ['reflected secret', (snapshot: LpfChannelSnapshot) => { snapshot.channel.options[0].iframe = `${oldGame}?secret=${token}`; }],
  ])('rejects an untrusted snapshot: %s', async (_name, mutate) => {
    const untrusted = remoteSnapshot();
    mutate(untrusted);
    const fetcher = vi.fn(async () => Response.json(untrusted));
    vi.stubGlobal('fetch', fetcher);
    const { getLpfChannelSnapshot } = await import('./lpf');
    expectUnavailable(await getLpfChannelSnapshot());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sanitizes remote errors and drops unrecognized fields', async () => {
    const untrusted = remoteSnapshot();
    untrusted.error = token;
    Object.assign(untrusted.channel.options[0], { clearKeys: { secret: token }, extra: token });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(untrusted)));
    const { getLpfChannelSnapshot } = await import('./lpf');
    const snapshot = await getLpfChannelSnapshot();
    expect(snapshot.channel.options[0].iframe).toBe(oldGame);
    expect(snapshot.error).toContain('PC relay could not refresh');
    expect(JSON.stringify(snapshot)).not.toContain(token);
  });

  it('rejects malformed JSON without exposing its body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`invalid ${token}`)));
    const { getLpfChannelSnapshot } = await import('./lpf');
    expectUnavailable(await getLpfChannelSnapshot());
  });

  it.each([null, {}, [], { channel: null, checkedAt: now }])('rejects missing snapshot structure: %j', async payload => {
    const fetcher = vi.fn(async () => Response.json(payload));
    vi.stubGlobal('fetch', fetcher);
    const { getLpfChannelSnapshot } = await import('./lpf');
    expectUnavailable(await getLpfChannelSnapshot());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never follows a real HTTP redirect or sends its bearer token to the redirect destination', async () => {
    vi.useRealTimers();
    const requests: { path: string | undefined; authorization: string | undefined }[] = [];
    const server = createServer((request, response) => {
      requests.push({ path: request.url, authorization: request.headers.authorization });
      response.writeHead(request.url === '/lpf' ? 302 : 200, { Location: '/steal' });
      response.end(token);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      vi.stubEnv('LPF_RELAY_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}/lpf`);
      const { getLpfChannelSnapshot } = await import('./lpf');
      expectUnavailable(await getLpfChannelSnapshot());
      expect(requests).toEqual([{ path: '/lpf', authorization: `Bearer ${token}` }]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
