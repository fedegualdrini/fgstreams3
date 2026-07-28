import { describe, it, expect } from 'vitest';
import { selectBestStream } from './streamSelector';
import type { Stream } from '@/types/api';

function makeStream(overrides: Partial<Stream> = {}): Stream {
  return { url: 'https://example.com/stream', language: 'en', quality: 'HD', ...overrides };
}

describe('selectBestStream', () => {
  it('returns null for empty array', () => {
    expect(selectBestStream([])).toBeNull();
  });

  it('returns the only stream by identity', () => {
    const s = makeStream();
    expect(selectBestStream([s])).toBe(s);
  });

  it('prefers English language', () => {
    const en = makeStream({ source: 'a', url: 'https://a.com/1', language: 'en' });
    const es = makeStream({ source: 'b', url: 'https://b.com/2', language: 'es' });
    expect(selectBestStream([es, en])).toBe(en);
  });

  it('language wins over quality', () => {
    const enSd = makeStream({ url: 'https://a.com/1', language: 'en', quality: 'SD' });
    const esHd = makeStream({ url: 'https://b.com/2', language: 'es', quality: 'HD' });
    expect(selectBestStream([esHd, enSd])).toBe(enSd);
  });

  it('among equal language, prefers HD quality', () => {
    const hd = makeStream({ source: 'a', url: 'https://a.com/1', quality: 'HD' });
    const sd = makeStream({ source: 'b', url: 'https://b.com/2', quality: 'SD' });
    expect(selectBestStream([sd, hd])).toBe(hd);
  });

  it('prefers a stream with known quality over one with none', () => {
    const known = makeStream({ url: 'https://a.com/1', quality: '720p' });
    const unknown = makeStream({ url: 'https://b.com/2', quality: undefined });
    expect(selectBestStream([unknown, known])).toBe(known);
  });

  it('is stable for otherwise-equal streams', () => {
    const first = makeStream({ url: 'https://a.com/1' });
    const second = makeStream({ url: 'https://b.com/2' });
    expect(selectBestStream([first, second])).toBe(first);
  });

  it('handles missing language and quality without throwing', () => {
    const s = makeStream({ source: undefined, language: undefined, quality: undefined });
    expect(() => selectBestStream([s])).not.toThrow();
  });
});
