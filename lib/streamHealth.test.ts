import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamHealthMonitor, healthKey, streamKeyFor } from './streamHealth';
import { HEALTH_ENTRY_TTL_MS, HEALTH_MAX_ENTRIES } from './constants';

const KEY = 'https://embed.example.com/live';

beforeEach(() => {
  streamHealthMonitor.clearAllEntries();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('healthKey', () => {
  it('keeps origin and pathname', () => {
    expect(healthKey('https://Embed.Example.com/live/1')).toBe('https://embed.example.com/live/1');
  });

  it('strips query and hash so rotating tokens collapse to one entry', () => {
    const a = healthKey('https://cdn.example.com/mono.m3u8?ip=1.2.3.4&token=aaa');
    const b = healthKey('https://cdn.example.com/mono.m3u8?ip=5.6.7.8&token=bbb');
    expect(a).toBe(b);
    expect(a).toBe('https://cdn.example.com/mono.m3u8');
  });

  it('strips a trailing slash', () => {
    expect(healthKey('https://a.com/live/')).toBe(healthKey('https://a.com/live'));
  });

  it('falls back to the raw string for unparseable input', () => {
    expect(healthKey('not a url')).toBe('not a url');
  });

  it('returns empty string for missing input', () => {
    expect(healthKey(undefined)).toBe('');
    expect(healthKey('   ')).toBe('');
  });
});

describe('streamKeyFor', () => {
  it('prefers embedUrl, which is the URL the player actually loads', () => {
    expect(streamKeyFor({ url: 'https://a.com/x', embedUrl: 'https://b.com/y' }))
      .toBe('https://b.com/y');
  });

  it('falls back to url', () => {
    expect(streamKeyFor({ url: 'https://a.com/x' })).toBe('https://a.com/x');
  });

  it('returns empty string for null', () => {
    expect(streamKeyFor(null)).toBe('');
  });
});

describe('health state machine', () => {
  it('starts unknown', () => {
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('unknown');
  });

  it('reportLoaded only reaches unstable — a loaded embed is not a playing one', () => {
    streamHealthMonitor.reportLoaded(KEY);
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('unstable');
  });

  it('reportSustained is the only path to working', () => {
    streamHealthMonitor.reportLoaded(KEY);
    streamHealthMonitor.reportSustained(KEY);
    const health = streamHealthMonitor.getStatus(KEY);
    expect(health.status).toBe('working');
    expect(health.sustained).toBe(true);
    expect(health.lastWorkingTime).toBeGreaterThan(0);
  });

  it('one failure is unstable, a second is offline', () => {
    streamHealthMonitor.reportFailed(KEY, 'timeout');
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('unstable');
    streamHealthMonitor.reportFailed(KEY, 'error');
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('offline');
    expect(streamHealthMonitor.getStatus(KEY).errorCount).toBe(2);
  });

  it('a sustained play clears the accumulated error count', () => {
    streamHealthMonitor.reportFailed(KEY);
    streamHealthMonitor.reportFailed(KEY);
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('offline');
    streamHealthMonitor.reportSustained(KEY);
    const health = streamHealthMonitor.getStatus(KEY);
    expect(health.status).toBe('working');
    expect(health.errorCount).toBe(0);
  });

  it('reportDegraded marks a recovered stream unstable', () => {
    streamHealthMonitor.reportSustained(KEY);
    streamHealthMonitor.reportDegraded(KEY);
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('unstable');
  });

  it('reportLoaded does not demote an already-working stream', () => {
    streamHealthMonitor.reportSustained(KEY);
    streamHealthMonitor.reportLoaded(KEY);
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('working');
  });

  it('ignores empty keys rather than creating a shared bucket', () => {
    streamHealthMonitor.reportSustained('');
    expect(streamHealthMonitor.getStatus('').status).toBe('unknown');
  });
});

describe('expiry and bounds', () => {
  it('reports unknown once an entry passes its TTL instead of showing stale state', () => {
    vi.useFakeTimers();
    streamHealthMonitor.reportSustained(KEY);
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('working');
    vi.advanceTimersByTime(HEALTH_ENTRY_TTL_MS + 1000);
    expect(streamHealthMonitor.getStatus(KEY).status).toBe('unknown');
  });

  it('evicts oldest entries beyond the cap', () => {
    for (let i = 0; i < HEALTH_MAX_ENTRIES + 25; i++) {
      streamHealthMonitor.reportLoaded(`https://a.com/${i}`);
    }
    expect(Object.keys(streamHealthMonitor.getSnapshot()).length).toBeLessThanOrEqual(HEALTH_MAX_ENTRIES);
    // The most recent write always survives.
    expect(streamHealthMonitor.getStatus(`https://a.com/${HEALTH_MAX_ENTRIES + 24}`).status).toBe('unstable');
  });
});

describe('subscription', () => {
  it('notifies subscribers on every mutation', () => {
    const listener = vi.fn();
    const unsubscribe = streamHealthMonitor.subscribe(listener);
    streamHealthMonitor.reportLoaded(KEY);
    streamHealthMonitor.reportSustained(KEY);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    streamHealthMonitor.reportFailed(KEY);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns a stable snapshot reference between mutations', () => {
    streamHealthMonitor.reportLoaded(KEY);
    const first = streamHealthMonitor.getSnapshot();
    expect(streamHealthMonitor.getSnapshot()).toBe(first);
    streamHealthMonitor.reportSustained(KEY);
    expect(streamHealthMonitor.getSnapshot()).not.toBe(first);
  });

  it('server snapshot is empty and stable, so hydration matches', () => {
    streamHealthMonitor.reportSustained(KEY);
    expect(streamHealthMonitor.getServerSnapshot()).toEqual({});
    expect(streamHealthMonitor.getServerSnapshot()).toBe(streamHealthMonitor.getServerSnapshot());
  });
});
