import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllMatches, fetchMatches, fetchSports, fetchStreamLookup, getImageUrl, getPosterUrl } from './api';
import { StreamFreeStreamsResponseSchema, StreamFreeSourcesResponseSchema, StreamFreeCategoriesResponseSchema } from './schemas';
import { STREAMFREE_SOURCE, toStreamFreeSources } from './streamfree';

const fetchMock = vi.fn<typeof fetch>();

const raw = {
  name: 'Ghana vs England', category: 'soccer', league: 'FIFA World Cup',
  stream_key: 'ghana-vs-england', match_timestamp: 1782244800,
  sources: [{ quality: 'FHD', url: 'https://strmfree.st/embed/soccer/ghana-vs-england1080p2', live: false }],
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
  it('rejects missing arrays, malformed stream entries and wrong envelopes', () => {
    for (const body of [[], {}, { count: 0 }, { count: 1, streams: [{}] },
      { count: 1, streams: [{ ...raw, sources: undefined }] },
      { count: 1, streams: [{ ...raw, match_timestamp: '1782244800' }] },
      { count: 1, streams: [{ ...raw, sources: [raw.sources[0].url] }] },
      { count: 1, streams: [{ ...raw, sources: [{ quality: 'FHD', live: true }] }] },
      { count: 1, streams: [{ ...raw, sources: [{ ...raw.sources[0], quality: 1080 }] }] },
      { count: 1, streams: [{ ...raw, sources: [{ ...raw.sources[0], url: 42 }] }] },
      { count: 1, streams: [{ ...raw, sources: [{ ...raw.sources[0], live: undefined }] }] },
      { count: 1, streams: [{ ...raw, sources: [{ ...raw.sources[0], live: 'true' }] }] }]) {
      expect(StreamFreeStreamsResponseSchema.safeParse(body).success).toBe(false);
    }
    expect(StreamFreeSourcesResponseSchema.safeParse({ stream_key: 'key' }).success).toBe(false);
    expect(StreamFreeCategoriesResponseSchema.safeParse({ categories: [42] }).success).toBe(false);
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
      streams: [{ ...raw, sources: [{ ...raw.sources[0], live: true }] }],
    }));
    expect(await fetchMatches()).toMatchObject([{
      id: raw.stream_key,
      isLive: true,
      sources: [{
        streams: [{ url: raw.sources[0].url, quality: '1080p', isLive: true }],
      }],
    }]);
  });

  it('refreshes source liveness when the provider takes a rendition offline', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      stream_key: raw.stream_key,
      sources: [{ ...raw.sources[0], live: true }],
    })).mockResolvedValueOnce(Response.json({
      stream_key: raw.stream_key,
      sources: raw.sources,
    }));
    expect(await fetchStreamLookup(STREAMFREE_SOURCE, raw.stream_key)).toEqual({
      ok: true,
      streams: [{
        url: raw.sources[0].url, embedUrl: raw.sources[0].url,
        source: STREAMFREE_SOURCE, isLive: true, quality: '1080p',
      }],
    });
    expect((await fetchStreamLookup(STREAMFREE_SOURCE, raw.stream_key)).streams).toMatchObject([
      { url: raw.sources[0].url, isLive: false },
    ]);
  });

  it('does not query this provider for an unknown source', async () => {
    expect(await fetchStreamLookup('other-provider', 'key')).toEqual({ streams: [], ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps failed and malformed source lookups distinct from successful empty results', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ stream_key: 'key', sources: ['obsolete-string'] }))
      .mockResolvedValueOnce(Response.json({ stream_key: 'key', sources: [] }));
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
      sources: [
        { quality: 'FHD', url: standby, live: false },
        { quality: 'SD', url: live, live: false },
        { quality: 'FHD', url: standby, live: false },
        { quality: 'HD', url: live, live: true },
        { quality: 'UHD', url: onlyLive, live: true },
        { quality: 'HD', url: live, live: true },
      ],
    });
    expect(streams).toEqual([
      { url: live, embedUrl: live, source: STREAMFREE_SOURCE, isLive: true, quality: '720p' },
      { url: onlyLive, embedUrl: onlyLive, source: STREAMFREE_SOURCE, isLive: true, quality: '2160p' },
      { url: standby, embedUrl: standby, source: STREAMFREE_SOURCE, isLive: false, quality: '1080p' },
    ]);
  });

  it('uses the provider quality label when a standby URL has no rendition suffix', () => {
    expect(toStreamFreeSources({ sources: [{ quality: 'HD', url: 'https://example.com/embed/key', live: false }] }))
      .toEqual([{ url: 'https://example.com/embed/key', embedUrl: 'https://example.com/embed/key', source: STREAMFREE_SOURCE, isLive: false, quality: 'hd' }]);
    expect(toStreamFreeSources({ sources: [] })).toEqual([]);
  });
});
