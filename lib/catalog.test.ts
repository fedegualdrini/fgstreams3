import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AngulismoSnapshot, RawMatch } from '@/types/api';

// unstable_cache is the thing under test's context, not its behaviour: the
// point is what buildCatalog hands it, so it is reduced to a pass-through.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));

const fetchAllMatches = vi.fn<() => Promise<RawMatch[] | null>>();
const fetchAngulismoData = vi.fn<() => Promise<AngulismoSnapshot>>();

vi.mock('./api', () => ({
  fetchAllMatches: () => fetchAllMatches(),
  fetchStreamLookup: vi.fn(),
}));
vi.mock('./promiedos', () => ({
  fetchPromiedosGames: async () => ({ games: [], ok: true, stale: false }),
}));
vi.mock('./angulismo', () => ({
  fetchAngulismoData: () => fetchAngulismoData(),
}));
vi.mock('fs/promises', () => {
  const readFile = async () => JSON.stringify([
    { name: 'ESPN Premium', logo: '', show: true, options: [{ name: 'o', iframe: 'https://a.example/e' }] },
  ]);
  return { readFile, default: { readFile } };
});

const { getCatalog } = await import('./catalog');

const match = (id: string): RawMatch => ({
  stream_key: id,
  name: 'Home Team vs Away Team',
  category: 'soccer',
  match_timestamp: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
  sources: [{ quality: 'FHD', url: `https://strmfree.st/embed/soccer/${id}1080p` }],
  live_sources: [],
});

describe('getCatalog', () => {
  beforeEach(() => {
    fetchAllMatches.mockReset();
    fetchAngulismoData.mockReset();
    fetchAngulismoData.mockResolvedValue({ events: [], channels: [], ok: true, stale: false });
  });

  it('returns the listable matches when the feed is healthy', async () => {
    fetchAllMatches.mockResolvedValue([match('a'), match('b')]);
    const catalog = await getCatalog();
    expect(catalog.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('serves the last good catalog when the feed fails', async () => {
    fetchAllMatches.mockResolvedValue([match('a')]);
    expect(await getCatalog()).toHaveLength(1);

    fetchAllMatches.mockResolvedValue(null);
    const catalog = await getCatalog();
    expect(catalog.map(m => m.id)).toEqual(['a']);
  });

  it('survives the feed throwing outright', async () => {
    fetchAllMatches.mockResolvedValue([match('a')]);
    await getCatalog();

    fetchAllMatches.mockRejectedValue(new Error('upstream down'));
    expect(await getCatalog()).toHaveLength(1);
  });

  it('still drops matches that aged out while the feed was down', async () => {
    fetchAllMatches.mockResolvedValue([
      { ...match('recent') },
      // Kicked off well outside the listing window.
      { ...match('ancient'), match_timestamp: Math.floor(Date.now() / 1000) - 48 * 60 * 60 },
    ]);
    const first = await getCatalog();
    expect(first.map(m => m.id)).toEqual(['recent']);

    fetchAllMatches.mockResolvedValue(null);
    const fallback = await getCatalog();
    expect(fallback.map(m => m.id)).toEqual(['recent']);
  });

  it('drops a match whose sources genuinely carry nothing', async () => {
    fetchAllMatches.mockResolvedValue([{ ...match('a'), sources: [] }]);
    expect(await getCatalog()).toEqual([]);
  });

  it('clears the previous catalog on a successful empty response', async () => {
    fetchAllMatches.mockResolvedValue([match('a')]);
    expect((await getCatalog()).map(m => m.id)).toEqual(['a']);
    fetchAllMatches.mockResolvedValue([]);
    expect(await getCatalog()).toEqual([]);
  });

  it('keeps live channels with old kickoff times and uses their inline variants', async () => {
    const channel = {
      ...match('redzone'),
      name: 'RedZone',
      match_timestamp: Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60,
      live_sources: [{ quality: 'FHD', url: 'https://strmfree.st/embed/football/redzone1080p' }],
    };
    fetchAllMatches.mockResolvedValue([channel]);
    const catalog = await getCatalog();
    expect(catalog.map(m => [m.id, m.isLive])).toEqual([['redzone', true]]);
    expect(catalog[0].streams.map(s => s.url)).toContain(channel.live_sources[0].url);
  });

  it('uses one fresh feed snapshot for fixture and channel viewing options', async () => {
    const fixture = { ...match('broadcast'), sources: [] };
    const liveChannel = {
      name: 'ESPN Premium',
      logo: '',
      show: true,
      options: [{ name: 'live', iframe: 'https://live.example/channel' }],
    };
    fetchAllMatches.mockResolvedValue([fixture]);
    fetchAngulismoData.mockResolvedValueOnce({
      channels: [liveChannel],
      events: [{
        id: 'fixture',
        title: fixture.name,
        competition: '',
        homeTeam: 'Home Team',
        awayTeam: 'Away Team',
        startTimeMs: fixture.match_timestamp! * 1000,
        channels: [{
          ...liveChannel,
          options: [{ name: 'event', iframe: 'https://live.example/event' }],
        }],
      }],
      ok: true,
      stale: false,
    });

    const catalog = await getCatalog();

    expect(catalog.map(item => item.id)).toEqual(['broadcast']);
    expect(catalog[0].broadcasts[0].options.map(option => option.iframe)).toEqual([
      'https://live.example/event',
      'https://live.example/channel',
      'https://a.example/e',
    ]);
    expect(fetchAngulismoData).toHaveBeenCalledTimes(1);
  });
});
