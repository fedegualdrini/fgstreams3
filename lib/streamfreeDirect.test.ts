import { describe, expect, it } from 'vitest';
import { isStreamFreeEmbedUrl, parseStreamFreeEmbedUrl, streamFreeManifestPath } from './streamfreeDirect';

describe('StreamFree Direct URL eligibility', () => {
  it.each([
    'https://strmfree.st/embed/basketball/game1080p',
    'https://strmfree.st/embed/basketball/game1080p2',
    'https://streamfree.top/embed/tv/skyf1720p',
    'https://streamfree.top:443/embed/tv/skyf12160p/',
  ])('accepts a public provider embed: %s', input => {
    expect(parseStreamFreeEmbedUrl(input).protocol).toBe('https:');
    expect(isStreamFreeEmbedUrl(input)).toBe(true);
  });

  it.each([
    '', 'https://127.0.0.1/embed/tv/game1080p', 'http://strmfree.st/embed/tv/game1080p',
    'https://strmfree.st.evil.example/embed/tv/game1080p',
    'https://user:pass@strmfree.st/embed/tv/game1080p',
    'https://strmfree.st:444/embed/tv/game1080p',
    'https://strmfree.st/embed/tv/game1080p?autostart=1',
    'https://strmfree.st/embed/tv/game1080p#player',
    'https://strmfree.st/a/../embed/tv/game1080p',
    'https://strmfree.st/embed/tv/%2e%2e/game1080p',
    'https://strmfree.st/embed/tv/game%311080p',
    'https://strmfree.st/embed//game1080p',
    'https://strmfree.st/embed/tv/game1080p/extra',
    'https://strmfree.st\\embed\\tv\\game1080p',
    ' https://strmfree.st/embed/tv/game1080p',
    'https://strmfree.st/embed/tv/game1080p\n',
    `https://strmfree.st/embed/tv/${'a'.repeat(2048)}`,
  ])('rejects unsupported or normalized input: %s', input => {
    expect(() => parseStreamFreeEmbedUrl(input)).toThrow();
    expect(isStreamFreeEmbedUrl(input)).toBe(false);
    expect(() => streamFreeManifestPath(input)).toThrow();
  });

  it('refers to the public embed rather than an expiring provider URL', () => {
    const embed = 'https://streamfree.top/embed/tv/skyf11080p';
    const path = new URL(streamFreeManifestPath(embed, 'high/audio.m3u8'), 'https://app.example');
    expect(path.pathname).toBe('/api/streamfree/manifest');
    expect(path.searchParams.get('embed')).toBe(embed);
    expect(path.searchParams.get('variant')).toBe('high/audio.m3u8');
  });
});
