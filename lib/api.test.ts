import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllMatches, fetchMatches, fetchSports, fetchStreamLookup, getImageUrl, getPosterUrl } from './api';
import { fetchJson } from './httpClient';
import { StreamFreeStreamsResponseSchema, StreamFreeSourcesResponseSchema, StreamFreeCategoriesResponseSchema } from './schemas';
import { STREAMFREE_SOURCE, toStreamFreeSources } from './streamfree';

vi.mock('./httpClient', () => ({ fetchJson: vi.fn() }));
const fetchMock = vi.mocked(fetchJson);

const raw = {
  name: 'Ghana vs England', category: 'soccer', league: 'FIFA World Cup',
  stream_key: 'ghana-vs-england', match_timestamp: 1782244800,
  sources: ['https://strmfree.st/embed/soccer/ghana-vs-england1080p2'],
  live_sources: [],
};

beforeEach(() => { fetchMock.mockReset(); });

describe('StreamFree response validation', () => {
  it('accepts documented streams without optional teams or id and preserves seconds', () => {
    const parsed = StreamFreeStreamsResponseSchema.parse({ count: 1, streams: [raw] });
    expect(parsed.streams[0].match_timestamp).toBe(1782244800);
  });

  it('accepts richer metadata, nullable fields and unknown upstream additions', () => {
    const stream = { ...raw, id: 'match-id', league: null, match_timestamp: null,
      thumbnail_url: null, team1: { name: 'Ghana', logo: null, extra: true }, team2: null, extra: true };
    expect(StreamFreeStreamsResponseSchema.parse({ count: 1, streams: [stream] }).streams[0]).toEqual(stream);
  });

  it('rejects missing arrays, malformed stream entries and wrong envelopes', () => {
    for (const body of [[], {}, { count: 0 }, { count: 1, streams: [{}] },
      { count: 1, streams: [{ ...raw, sources: undefined }] },
      { count: 1, streams: [{ ...raw, match_timestamp: '1782244800' }] }]) {
      expect(StreamFreeStreamsResponseSchema.safeParse(body).success).toBe(false);
    }
    expect(StreamFreeSourcesResponseSchema.safeParse({ stream_key: 'key', sources: [] }).success).toBe(false);
    expect(StreamFreeCategoriesResponseSchema.safeParse({ categories: [42] }).success).toBe(false);
    expect(StreamFreeSourcesResponseSchema.parse({ stream_key: 'key', sources: [], live_sources: [] })).toEqual({ stream_key: 'key', sources: [], live_sources: [] });
  });
});

describe('StreamFree API adapter', () => {
  it('distinguishes request failure from a quiet feed without fan-out', async () => {
    fetchMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ count: 0, streams: [] });
    expect(await fetchAllMatches()).toBeNull();
    expect(await fetchAllMatches()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://strmfree.st/api/v1/streams');
  });

  it('encodes category and stream keys', async () => {
    fetchMock.mockResolvedValueOnce({ count: 0, streams: [] })
      .mockResolvedValueOnce({ stream_key: 'key /?', sources: [], live_sources: [] });
    await fetchMatches('sport /?');
    expect(fetchMock.mock.calls[0][0]).toBe('https://strmfree.st/api/v1/streams?category=sport%20%2F%3F');
    expect(await fetchStreamLookup(STREAMFREE_SOURCE, 'key /?')).toEqual({ streams: [], ok: true });
    expect(fetchMock.mock.calls[1][0]).toBe('https://strmfree.st/api/v1/sources/key%20%2F%3F');
  });

  it('does not query this provider for an unknown source', async () => {
    expect(await fetchStreamLookup('other-provider', 'key')).toEqual({ streams: [], ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a failed source lookup distinct from a successful empty result', async () => {
    fetchMock.mockResolvedValueOnce(null);
    expect(await fetchStreamLookup(STREAMFREE_SOURCE, 'key')).toEqual({ streams: [], ok: false });
  });

  it('maps categories without confusing soccer and American football', async () => {
    fetchMock.mockResolvedValueOnce({ categories: ['football', 'soccer'] });
    expect(await fetchSports()).toEqual([
      { id: 'football', slug: 'football', name: 'American Football' },
      { id: 'soccer', slug: 'soccer', name: 'Soccer' },
    ]);
  });

  it('preserves absolute images and resolves relative paths without inventing extensions', () => {
    expect(getImageUrl('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png');
    expect(getPosterUrl('/thumbnails/event')).toBe('https://strmfree.st/thumbnails/event');
    expect(getPosterUrl(undefined)).toBe('');
  });
});

describe('StreamFree source variants', () => {
  it('deduplicates URLs, keeps live variants first and does not invent language', () => {
    const live = 'https://strmfree.st/embed/soccer/match720p';
    const standby = 'https://strmfree.st/embed/soccer/match1080p2';
    const onlyLive = 'https://strmfree.st/embed/soccer/match2160p';
    const streams = toStreamFreeSources({ sources: [standby, live, standby], live_sources: [live, onlyLive, live] });
    expect(streams).toEqual([
      { url: live, embedUrl: live, source: STREAMFREE_SOURCE, isLive: true, quality: '720p' },
      { url: onlyLive, embedUrl: onlyLive, source: STREAMFREE_SOURCE, isLive: true, quality: '2160p' },
      { url: standby, embedUrl: standby, source: STREAMFREE_SOURCE, isLive: false, quality: '1080p' },
    ]);
  });

  it('retains standby-only streams and handles an empty variant set', () => {
    expect(toStreamFreeSources({ sources: ['https://example.com/embed/key'], live_sources: [] }))
      .toEqual([{ url: 'https://example.com/embed/key', embedUrl: 'https://example.com/embed/key', source: STREAMFREE_SOURCE, isLive: false }]);
    expect(toStreamFreeSources({ sources: [], live_sources: [] })).toEqual([]);
  });
});
