import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllMatches, fetchMatches, fetchSports, fetchStreamLookup, getImageUrl, getPosterUrl } from './api';
import { StreamFreeStreamsResponseSchema, StreamFreeSourcesResponseSchema, StreamFreeCategoriesResponseSchema } from './schemas';
import { STREAMFREE_SOURCE, toStreamFreeSources } from './streamfree';

const fetchMock = vi.fn<typeof fetch>();

const raw = {
  name: 'Ghana vs England', category: 'soccer', league: 'FIFA World Cup',
  stream_key: 'ghana-vs-england', match_timestamp: 1782244800,
  sources: [{ quality: 'FHD', url: 'https://strmfree.st/embed/soccer/ghana-vs-england1080p2' }],
  live_sources: [],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
      { count: 1, streams: [{ ...raw, match_timestamp: '1782244800' }] },
      { count: 1, streams: [{ ...raw, sources: [raw.sources[0].url] }] },
      { count: 1, streams: [{ ...raw, live_sources: [raw.sources[0].url] }] },
      { count: 1, streams: [{ ...raw, sources: [{ quality: 'FHD' }] }] },
      { count: 1, streams: [{ ...raw, sources: [{ quality: 1080, url: raw.sources[0].url }] }] },
      { count: 1, streams: [{ ...raw, live_sources: [{ quality: 'FHD', url: 42 }] }] }]) {
      expect(StreamFreeStreamsResponseSchema.safeParse(body).success).toBe(false);
    }
    expect(StreamFreeSourcesResponseSchema.safeParse({ stream_key: 'key', sources: [] }).success).toBe(false);
    expect(StreamFreeCategoriesResponseSchema.safeParse({ categories: [42] }).success).toBe(false);
    expect(StreamFreeSourcesResponseSchema.parse({ stream_key: 'key', sources: [], live_sources: [] })).toEqual({ stream_key: 'key', sources: [], live_sources: [] });
  });
});

describe('StreamFree API adapter', () => {
  it('distinguishes an upstream failure from a successful quiet feed', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ count: 0, streams: [] }));
    expect(await fetchAllMatches()).toBeNull();
    expect(await fetchAllMatches()).toEqual([]);
  });

  it('lists live matches from the validated structured-source feed', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      count: 1,
      streams: [{ ...raw, live_sources: [{ ...raw.sources[0] }] }],
    }));
    expect(await fetchMatches()).toMatchObject([{
      id: raw.stream_key,
      isLive: true,
      sources: [{
        streams: [{ url: raw.sources[0].url, quality: '1080p', isLive: true }],
      }],
    }]);
  });

  it('refreshes live source objects without duplicating their standby entries', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      stream_key: raw.stream_key,
      sources: raw.sources,
      live_sources: [{ ...raw.sources[0] }],
    }));
    expect(await fetchStreamLookup(STREAMFREE_SOURCE, raw.stream_key)).toEqual({
      ok: true,
      streams: [{
        url: raw.sources[0].url, embedUrl: raw.sources[0].url,
        source: STREAMFREE_SOURCE, isLive: true, quality: '1080p',
      }],
    });
  });

  it('does not query this provider for an unknown source', async () => {
    expect(await fetchStreamLookup('other-provider', 'key')).toEqual({ streams: [], ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps failed and malformed source lookups distinct from successful empty results', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ stream_key: 'key', sources: ['obsolete-string'], live_sources: [] }))
      .mockResolvedValueOnce(Response.json({ stream_key: 'key', sources: [], live_sources: [] }));
    expect(await fetchStreamLookup(STREAMFREE_SOURCE, 'key')).toEqual({ streams: [], ok: false });
    expect(await fetchStreamLookup(STREAMFREE_SOURCE, 'key')).toEqual({ streams: [], ok: false });
    expect(await fetchStreamLookup(STREAMFREE_SOURCE, 'key')).toEqual({ streams: [], ok: true });
  });

  it('maps categories without confusing soccer and American football', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ categories: ['football', 'soccer'] }));
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
    const streams = toStreamFreeSources({
      sources: [{ quality: 'FHD', url: standby }, { quality: 'HD', url: live }, { quality: 'FHD', url: standby }],
      live_sources: [{ quality: 'HD', url: live }, { quality: 'UHD', url: onlyLive }, { quality: 'HD', url: live }],
    });
    expect(streams).toEqual([
      { url: live, embedUrl: live, source: STREAMFREE_SOURCE, isLive: true, quality: '720p' },
      { url: onlyLive, embedUrl: onlyLive, source: STREAMFREE_SOURCE, isLive: true, quality: '2160p' },
      { url: standby, embedUrl: standby, source: STREAMFREE_SOURCE, isLive: false, quality: '1080p' },
    ]);
  });

  it('uses the provider quality label when a standby URL has no rendition suffix', () => {
    expect(toStreamFreeSources({ sources: [{ quality: 'HD', url: 'https://example.com/embed/key' }], live_sources: [] }))
      .toEqual([{ url: 'https://example.com/embed/key', embedUrl: 'https://example.com/embed/key', source: STREAMFREE_SOURCE, isLive: false, quality: 'hd' }]);
    expect(toStreamFreeSources({ sources: [], live_sources: [] })).toEqual([]);
  });
});
