import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Advance retry state without real sleeps; the deadline case controls when backoff completes.
vi.mock('node:timers/promises', () => {
  const timers = { setTimeout: vi.fn() };
  return { ...timers, default: timers };
});

const source = (number: number) => `https://emitiendoenvivo.com/lpf/${number}.m3u8`;
const oldGame = 'https://liveassets-a.encoders.immergo.tv/old/stream.m3u8';
const nextGame = 'https://liveassets-b.encoders.immergo.tv/new/master.m3u8';
const now = Date.parse('2026-10-25T18:00:00Z');

function activePlaylist() {
  return new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-PROGRAM-DATE-TIME:${new Date(Date.now() - 6000).toISOString()}\n#EXTINF:6,\nsegment.ts\n`);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('LPF_RELAY_URL', undefined);
  vi.stubEnv('LPF_RELAY_TOKEN', undefined);
  vi.mocked(delay).mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LPF source refresh', () => {
  it('replaces a previous game after expiry and never keeps its URL when the numbered slot goes empty', async () => {
    let destination: string | null = oldGame;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === source(1)) {
        return new Response(null, { status: 302, headers: destination ? { Location: destination } : {} });
      }
      if (url === oldGame || url === nextGame) return activePlaylist();
      return new Response(null, { status: 302 });
    }));
    // Each case imports a fresh module because its per-instance cache is part of the behavior.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const first = await getLpfChannelSnapshot();
    expect(first.channel.options[0]).toMatchObject({ iframe: oldGame, sourceUrl: source(1), status: 'live' });

    destination = nextGame;
    vi.setSystemTime(now + 60_001);
    const second = await getLpfChannelSnapshot();
    expect(second.channel.options[0]).toMatchObject({ iframe: nextGame, sourceUrl: source(1), status: 'live' });

    destination = null;
    vi.setSystemTime(now + 120_002);
    const third = await getLpfChannelSnapshot();
    expect(third.channel.options[0]).toMatchObject({ iframe: source(1), status: 'unavailable' });
    expect(third.channel.options.map(option => option.name)).toEqual(
      Array.from({ length: 18 }, (_, index) => `Option ${index + 1}`),
    );
  });

  it('forces an unexpired snapshot to refresh, shares active lookups, and replaces failures without stale playback', async () => {
    let destination: string | null = oldGame;
    let hold = false;
    let sourceRequests = 0;
    const release = Promise.withResolvers<void>();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === source(1)) {
        sourceRequests++;
        if (hold) await release.promise;
        return destination
          ? new Response(null, { status: 302, headers: { Location: destination } })
          : new Response(null, { status: 403 });
      }
      if (url === oldGame || url === nextGame) return activePlaylist();
      return new Response(null, { status: 302 });
    }));
    const { getLpfChannelSnapshot } = await import('./lpf');
    const first = await getLpfChannelSnapshot();
    destination = nextGame;
    vi.setSystemTime(now + 1000);
    expect(await getLpfChannelSnapshot()).toBe(first);
    hold = true;
    const forced = getLpfChannelSnapshot(true);
    const concurrentManual = getLpfChannelSnapshot(true);
    const concurrentAutomatic = getLpfChannelSnapshot();
    release.resolve();
    const [updated, manual, automatic] = await Promise.all([forced, concurrentManual, concurrentAutomatic]);
    expect(updated.channel.options[0]).toMatchObject({ iframe: nextGame, status: 'live' });
    expect(updated.checkedAt).toBe(now + 1000);
    expect(manual).toBe(updated);
    expect(automatic).toBe(updated);
    expect(await getLpfChannelSnapshot()).toBe(updated);
    expect(sourceRequests).toBe(2);

    destination = null;
    const failed = await getLpfChannelSnapshot(true);
    expect(failed.channel.options[0]).toMatchObject({ iframe: source(1), status: 'unavailable' });
    expect(await getLpfChannelSnapshot()).toBe(failed);
    destination = nextGame;
    expect((await getLpfChannelSnapshot(true)).channel.options[0]).toMatchObject({ iframe: nextGame, status: 'live' });
  });

  it('rejects an unsafe redirect without fetching it while retaining a finished broadcast status in another slot', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      fetched.push(url);
      if (url === source(1)) return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private.m3u8' } });
      if (url === source(2)) return new Response(null, { status: 302, headers: { Location: oldGame } });
      if (url === oldGame) return new Response('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST\n');
      return new Response(null, { status: 302 });
    }));
    // Static import would retain the previous case's module-level snapshot.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const snapshot = await getLpfChannelSnapshot();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: source(1), status: 'unavailable' });
    expect(snapshot.channel.options[1]).toMatchObject({ iframe: oldGame, status: 'ended' });
    expect(fetched).not.toContain('http://127.0.0.1/private.m3u8');
    expect(snapshot.error).toContain('options 1');
  });

  it('recovers the current game after six connection resets instead of leaving the source unavailable', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === source(1)) {
        if (++attempts <= 6) {
          throw new TypeError('fetch failed', { cause: Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }) });
        }
        return new Response(null, { status: 302, headers: { Location: nextGame } });
      }
      if (url === nextGame) return activePlaylist();
      return new Response(null, { status: 302 });
    }));
    // Import a fresh resolver so another test's cached snapshot cannot hide the failure.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const snapshot = await getLpfChannelSnapshot();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: nextGame, status: 'live' });
    expect(snapshot.error).toBeUndefined();
    expect(attempts).toBe(7);
  });

  it('bounds persistent socket resets without losing another available source', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === source(1)) {
        attempts++;
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' }) });
      }
      if (url === source(2)) return new Response(null, { status: 302, headers: { Location: nextGame } });
      if (url === nextGame) return activePlaylist();
      return new Response(null, { status: 302 });
    }));
    // Import a fresh resolver because exhaustion must not use a previous successful snapshot.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const snapshot = await getLpfChannelSnapshot();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: source(1), status: 'unavailable' });
    expect(snapshot.channel.options[1]).toMatchObject({ iframe: nextGame, status: 'live' });
    expect(snapshot.error).toContain('options 1.');
    expect(attempts).toBe(7);
  });

  it('recovers from a per-attempt connection timeout while the overall refresh still has time', async () => {
    const timedOutAttempt = new AbortController();
    let timeoutUsed = false;
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
      if (milliseconds === 10_000 && !timeoutUsed) {
        timeoutUsed = true;
        return timedOutAttempt.signal;
      }
      return new AbortController().signal;
    });
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === source(1)) {
        if (++attempts === 1) {
          timedOutAttempt.abort(new DOMException('Connection timed out', 'TimeoutError'));
          throw timedOutAttempt.signal.reason;
        }
        return new Response(null, { status: 302, headers: { Location: nextGame } });
      }
      if (url === nextGame) return activePlaylist();
      return new Response(null, { status: 302 });
    }));
    // A fresh module must exercise the first attempt rather than reuse another snapshot.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const snapshot = await getLpfChannelSnapshot();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: nextGame, status: 'live' });
    expect(snapshot.error).toBeUndefined();
    expect(attempts).toBe(2);
  });

  it('does not retry a provider CAPTCHA response', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === source(1)) {
        attempts++;
        return new Response('<html>Bot Verification</html>', { status: 403 });
      }
      return new Response(null, { status: 302 });
    }));
    // A fresh module ensures the provider response is exercised rather than a cached snapshot.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const snapshot = await getLpfChannelSnapshot();
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: source(1), status: 'unavailable' });
    expect(snapshot.error).toContain('options 1.');
    expect(attempts).toBe(1);
  });

  it('stops retrying when the shared refresh deadline expires during backoff', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds =>
      milliseconds === 25_000 ? deadline.signal : new AbortController().signal,
    );
    const backoff = Promise.withResolvers<undefined>();
    vi.mocked(delay).mockReturnValueOnce(backoff.promise);
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === source(1)) {
        attempts++;
        throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
      }
      return new Response(null, { status: 302 });
    }));
    // Fresh import gives this refresh its own shared deadline and no cached result.
    const { getLpfChannelSnapshot } = await import('./lpf');
    const result = getLpfChannelSnapshot();
    await vi.advanceTimersByTimeAsync(0);
    deadline.abort(new DOMException('Refresh deadline expired', 'TimeoutError'));
    backoff.resolve(undefined);
    const snapshot = await result;
    expect(snapshot.channel.options[0]).toMatchObject({ iframe: source(1), status: 'unavailable' });
    expect(snapshot.error).toContain('options 1.');
    expect(attempts).toBe(1);
  });
});
