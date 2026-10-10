import { describe, expect, it } from 'vitest';
import type { CatalogMatch } from '@/types/api';
import { filterMatchLists, hasNoSearchResults, shouldShowRecentlyWatched, toListedMatch } from './matchListView';

function match(id: string, sport: string, team1: string): CatalogMatch {
  return { id, sport, team1, team2: 'Rivals', league: 'League', isLive: false, sources: [] } as unknown as CatalogMatch;
}

const live = [match('1', 'Football', 'Arsenal'), match('2', 'Tennis', 'Alcaraz')];
const upcoming = [match('3', 'Football', 'Chelsea')];

describe('filterMatchLists', () => {
  it('returns everything for the default filters', () => {
    const result = filterMatchLists(live, upcoming, { query: '', sport: 'All' });
    expect(result.live).toHaveLength(2);
    expect(result.upcoming).toHaveLength(1);
  });

  it('applies sport and query to both sections', () => {
    const result = filterMatchLists(live, upcoming, { query: 'chel', sport: 'Football' });
    expect(result.live).toHaveLength(0);
    expect(result.upcoming.map((m) => m.id)).toEqual(['3']);
  });
});

describe('shouldShowRecentlyWatched', () => {
  it('needs history and untouched filters', () => {
    expect(shouldShowRecentlyWatched(2, { query: '', sport: 'All' })).toBe(true);
    expect(shouldShowRecentlyWatched(0, { query: '', sport: 'All' })).toBe(false);
    expect(shouldShowRecentlyWatched(2, { query: '  x ', sport: 'All' })).toBe(false);
    expect(shouldShowRecentlyWatched(2, { query: '   ', sport: 'All' })).toBe(true);
    expect(shouldShowRecentlyWatched(2, { query: '', sport: 'Tennis' })).toBe(false);
  });
});

describe('hasNoSearchResults', () => {
  it('is only true for a non-blank query with nothing matching', () => {
    expect(hasNoSearchResults('zzz', { live: [], upcoming: [] })).toBe(true);
    expect(hasNoSearchResults('  ', { live: [], upcoming: [] })).toBe(false);
    expect(hasNoSearchResults('zzz', { live, upcoming: [] })).toBe(false);
  });
});

describe('toListedMatch', () => {
  const full = {
    id: 'a-vs-b-1',
    sport: 'football',
    league: 'Liga',
    team1: 'A',
    team2: 'B',
    startTime: '2026-10-10T18:00:00.000Z',
    isLive: true,
    poster: '/p.webp',
    sources: [{ source: 'alpha', id: '1' }],
    streams: [{ url: 'https://embed.example/1', embedUrl: 'https://embed.example/1' }],
    broadcasts: [{ network: 'ESPN', channel: 'ESPN Premium', logo: '/l.webp', options: [{ name: 'o', iframe: 'https://x/y' }] }],
    liveHint: true,
  } as unknown as CatalogMatch;

  it('keeps what the cards render and the broadcaster names', () => {
    const listed = toListedMatch(full);
    expect(listed).toMatchObject({ id: 'a-vs-b-1', team1: 'A', team2: 'B', isLive: true, poster: '/p.webp' });
    expect(listed.broadcasts).toEqual([{ network: 'ESPN', channel: 'ESPN Premium' }]);
  });

  it('drops stream URLs and playable options, which only the match page uses', () => {
    const serialized = JSON.stringify(toListedMatch(full));
    expect(serialized).not.toContain('embed.example');
    expect(serialized).not.toContain('https://x/y');
    expect(serialized).not.toContain('sources');
  });
});
