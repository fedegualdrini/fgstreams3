import { describe, it, expect, beforeEach } from 'vitest';
import { selectBestStream } from './streamSelector';
import { streamHealthMonitor } from './streamHealth';
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

  it('returns the only stream', () => {
    const s = makeStream();
    // selectBestStream spreads the stream with added id/healthStatus fields
    expect(selectBestStream([s])).toMatchObject({ url: s.url, language: s.language });
  });

  it('prefers working stream over unknown', () => {
    const working = makeStream({ source: 'a', url: 'https://a.com/1' });
    const unknown = makeStream({ source: 'b', url: 'https://b.com/2' });
    streamHealthMonitor.updateStatus('a-0', 'working', true);
    const result = selectBestStream([working, unknown]);
    expect(result).toMatchObject({ url: 'https://a.com/1' });
  });

  it('prefers unknown over offline', () => {
    const unknown = makeStream({ source: 'a', url: 'https://a.com/1' });
    const offline = makeStream({ source: 'b', url: 'https://b.com/2' });
    streamHealthMonitor.updateStatus('b-1', 'offline', false);
    const result = selectBestStream([unknown, offline]);
    expect(result).toMatchObject({ url: 'https://a.com/1' });
  });

  it('among equal health, prefers English language', () => {
    const en = makeStream({ source: 'a', url: 'https://a.com/1', language: 'en' });
    const es = makeStream({ source: 'b', url: 'https://b.com/2', language: 'es' });
    const result = selectBestStream([es, en]);
    expect(result).toMatchObject({ url: 'https://a.com/1', language: 'en' });
  });

  it('among equal health and language, prefers HD quality', () => {
    const hd = makeStream({ source: 'a', url: 'https://a.com/1', quality: 'HD' });
    const sd = makeStream({ source: 'b', url: 'https://b.com/2', quality: 'SD' });
    const result = selectBestStream([sd, hd]);
    expect(result).toMatchObject({ url: 'https://a.com/1', quality: 'HD' });
  });

  it('handles streams without source using URL hostname as key', () => {
    const s = makeStream({ source: undefined, url: 'https://cdn.example.com/stream' });
    // Should not throw
    expect(() => selectBestStream([s])).not.toThrow();
  });
});
