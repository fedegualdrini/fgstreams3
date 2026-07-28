import { describe, it, expect, beforeEach } from 'vitest';
import { selectBestStream } from './streamSelector';
import { streamHealthMonitor, streamKeyFor } from './streamHealth';
import type { Stream } from '@/types/api';

function makeStream(overrides: Partial<Stream> = {}): Stream {
  return { url: 'https://example.com/stream', language: 'en', quality: 'HD', ...overrides };
}

beforeEach(() => {
  streamHealthMonitor.clearAllEntries();
});

describe('selectBestStream', () => {
  it('returns null for empty array', () => {
    expect(selectBestStream([])).toBeNull();
  });

  it('returns the only stream by identity', () => {
    const s = makeStream();
    expect(selectBestStream([s])).toBe(s);
  });

  it('prefers working stream over unknown', () => {
    const working = makeStream({ source: 'a', url: 'https://a.com/1' });
    const unknown = makeStream({ source: 'b', url: 'https://b.com/2' });
    streamHealthMonitor.reportSustained(streamKeyFor(working));
    expect(selectBestStream([unknown, working])).toBe(working);
  });

  it('prefers unstable over unknown', () => {
    const unstable = makeStream({ source: 'a', url: 'https://a.com/1' });
    const unknown = makeStream({ source: 'b', url: 'https://b.com/2' });
    streamHealthMonitor.reportLoaded(streamKeyFor(unstable));
    expect(selectBestStream([unknown, unstable])).toBe(unstable);
  });

  it('prefers unknown over offline', () => {
    const unknown = makeStream({ source: 'a', url: 'https://a.com/1' });
    const offline = makeStream({ source: 'b', url: 'https://b.com/2' });
    streamHealthMonitor.reportFailed(streamKeyFor(offline));
    streamHealthMonitor.reportFailed(streamKeyFor(offline));
    expect(selectBestStream([offline, unknown])).toBe(unknown);
  });

  it('keys health by URL, so it matches regardless of position in the list', () => {
    const good = makeStream({ url: 'https://a.com/1?token=xyz' });
    const other = makeStream({ url: 'https://b.com/2' });
    // Seeded with a different token — the key strips the query.
    streamHealthMonitor.reportSustained('https://a.com/1');
    expect(selectBestStream([other, good])).toBe(good);
  });

  it('uses embedUrl for the health key when present', () => {
    const good = makeStream({ url: 'https://a.com/1', embedUrl: 'https://embed.a.com/1' });
    const other = makeStream({ url: 'https://b.com/2' });
    streamHealthMonitor.reportSustained('https://embed.a.com/1');
    expect(selectBestStream([other, good])).toBe(good);
  });

  it('among equal health, prefers English language', () => {
    const en = makeStream({ source: 'a', url: 'https://a.com/1', language: 'en' });
    const es = makeStream({ source: 'b', url: 'https://b.com/2', language: 'es' });
    expect(selectBestStream([es, en])).toBe(en);
  });

  it('among equal health and language, prefers HD quality', () => {
    const hd = makeStream({ source: 'a', url: 'https://a.com/1', quality: 'HD' });
    const sd = makeStream({ source: 'b', url: 'https://b.com/2', quality: 'SD' });
    expect(selectBestStream([sd, hd])).toBe(hd);
  });

  it('is stable for otherwise-equal streams', () => {
    const first = makeStream({ url: 'https://a.com/1' });
    const second = makeStream({ url: 'https://b.com/2' });
    expect(selectBestStream([first, second])).toBe(first);
  });

  it('accepts an injected status resolver, so ranking is testable in isolation', () => {
    const a = makeStream({ url: 'https://a.com/1' });
    const b = makeStream({ url: 'https://b.com/2' });
    const result = selectBestStream([a, b], (s) => (s.url === 'https://b.com/2' ? 'working' : 'offline'));
    expect(result).toBe(b);
  });

  it('handles streams with unparseable URLs without throwing', () => {
    const s = makeStream({ source: undefined, url: 'not-a-url' });
    expect(() => selectBestStream([s])).not.toThrow();
  });
});
