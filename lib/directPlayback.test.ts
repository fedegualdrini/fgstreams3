// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getDirectPlayback } from './directPlayback';

describe('direct playback URL mapping', () => {
  it.each([
    ['https://embed.st/embed/admin/example-match/1', 'embed-st', '/api/embed-st/manifest'],
    ['https://strmfree.st/embed/basketball/example-match1080p2', 'streamfree', '/api/streamfree/manifest'],
    ['https://streamfree.top/embed/football/skyf11080p', 'streamfree', '/api/streamfree/manifest'],
  ])('maps the supported embed %s without changing its selected source', (input, provider, route) => {
    const playback = getDirectPlayback(input);
    expect(playback?.provider).toBe(provider);
    const manifest = new URL(playback!.src, 'https://app.example');
    expect(manifest.pathname).toBe(route);
    expect(manifest.searchParams.get('embed')).toBe(input);
    expect([...manifest.searchParams.keys()]).toEqual(['embed']);
  });

  it.each([
    '',
    'not a URL',
    '/api/streamfree/manifest?embed=anything',
    'https://example.com/video.m3u8',
    'https://embed.st.evil.example/embed/admin/match/1',
    'http://strmfree.st/embed/basketball/example1080p2',
    'https://strmfree.st.evil.example/embed/basketball/example1080p2',
    'https://user:password@strmfree.st/embed/basketball/example1080p2',
    'https://strmfree.st:444/embed/basketball/example1080p2',
    'https://strmfree.st/embed/basketball/example1080p2?redirect=https://example.com',
    'https://streamfree.top/embed/football/skyf11080p#variant',
    'https://strmfree.st/embed/basketball/example1080p2/extra',
  ])('returns null, without throwing or treating arbitrary media as direct, for %s', input => {
    expect(getDirectPlayback(input)).toBeNull();
  });
});
