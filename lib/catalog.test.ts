import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RawMatch } from '@/types/api';

// unstable_cache is the thing under test's context, not its behaviour: the
// point is what buildCatalog hands it, so it is reduced to a pass-through.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));

const fetchAllMatches = vi.fn<() => Promise<RawMatch[]>>();
const fetchLiveMatchIds = vi.fn(async () => new Set<string>());
const fetchStreams = vi.fn(async () => [{ url: 'https://a.example/s', embedUrl: 'https://a.example/s' }]);

vi.mock('./api', () => ({
  fetchAllMatches: () => fetchAllMatches(),
  fetchLiveMatchIds: () => fetchLiveMatchIds(),
  fetchStreams: () => fetchStreams(),
}));
vi.mock('./promiedos', () => ({
  fetchPromiedosGames: async () => ({ games: [], ok: true, stale: false }),
}));
vi.mock('./angulismo', () => ({
  fetchAngulismoData: async () => ({ events: [], channels: [], ok: true, stale: false }),
}));
vi.mock('./channelCatalog', () => ({
  getChannelCatalog: async () => [
    { name: 'ESPN Premium', logo: '', show: true, options: [{ name: 'o', iframe: 'https://a.example/e' }] },
  ],
}));

const { getCatalog } = await import('./catalog');

const match = (id: string): RawMatch => ({
  id,
  title: 'Home Team vs Away Team',
  category: 'football',
  date: Date.now() + 30 * 60 * 1000,
  sources: [{ source: 'alpha', id }],
});

describe('getCatalog', () => {
  beforeEach(() => {
    fetchAllMatches.mockReset();
    fetchStreams.mockClear();
  });

  it('returns the listable matches when the feed is healthy', async () => {
    fetchAllMatches.mockResolvedValue([match('a'), match('b')]);
    const catalog = await getCatalog();
    expect(catalog.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('serves the last good catalog when the feed comes back empty', async () => {
    fetchAllMatches.mockResolvedValue([match('a')]);
    expect(await getCatalog()).toHaveLength(1);

    // An empty feed is a failed fetch. Returning [] here would be cached and
    // would empty the site for a full revalidation window.
    fetchAllMatches.mockResolvedValue([]);
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
      { ...match('ancient'), date: Date.now() - 48 * 60 * 60 * 1000 },
    ]);
    const first = await getCatalog();
    expect(first.map(m => m.id)).toEqual(['recent']);

    fetchAllMatches.mockResolvedValue([]);
    const fallback = await getCatalog();
    expect(fallback.map(m => m.id)).toEqual(['recent']);
  });
});
