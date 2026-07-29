import { describe, expect, it } from 'vitest';
import {
  ALL_SPORT_FILTER,
  getAvailableSportFilters,
  matchesFilters,
  matchesSearch,
  matchesSport,
} from './matchFilters';
import type { Match } from '@/types/api';

function match(overrides: Partial<Match>): Match {
  return {
    id: 'match-1',
    sport: 'Football',
    league: 'Premier League',
    team1: 'Arsenal',
    team2: 'Chelsea',
    sources: [],
    ...overrides,
  };
}

describe('getAvailableSportFilters', () => {
  it('preserves All and derives unique sports from matches', () => {
    expect(getAvailableSportFilters([
      match({ sport: 'Football' }),
      match({ sport: 'football' }),
      match({ sport: 'Darts' }),
      match({ sport: '  Tennis  ' }),
      match({ sport: '' }),
    ])).toEqual([ALL_SPORT_FILTER, 'Darts', 'Football', 'Tennis']);
  });

  it('returns All when no matches have a sport', () => {
    expect(getAvailableSportFilters([
      match({ sport: '' }),
      match({ sport: '   ' }),
    ])).toEqual([ALL_SPORT_FILTER]);
  });
});

describe('matchesSearch', () => {
  it('matches team, league, and sport fields case-insensitively', () => {
    const candidate = match({
      team1: 'New Zealand',
      team2: 'Australia',
      league: 'World Cup',
      sport: 'Rugby',
    });

    expect(matchesSearch(candidate, 'zealand')).toBe(true);
    expect(matchesSearch(candidate, 'WORLD')).toBe(true);
    expect(matchesSearch(candidate, 'rug')).toBe(true);
    expect(matchesSearch(candidate, 'basketball')).toBe(false);
  });
});

describe('matchesSport', () => {
  it('keeps All and sport-specific filtering case-insensitive', () => {
    const candidate = match({ sport: 'Formula 1' });

    expect(matchesSport(candidate, ALL_SPORT_FILTER)).toBe(true);
    expect(matchesSport(candidate, 'all')).toBe(true);
    expect(matchesSport(candidate, 'formula 1')).toBe(true);
    expect(matchesSport(candidate, 'Football')).toBe(false);
  });
});

describe('matchesFilters', () => {
  it('requires both search and sport filters to match', () => {
    const candidate = match({ sport: 'MMA', league: 'UFC', team1: 'Fighter A' });

    expect(matchesFilters(candidate, 'ufc', 'mma')).toBe(true);
    expect(matchesFilters(candidate, 'ufc', 'Tennis')).toBe(false);
    expect(matchesFilters(candidate, 'missing', 'mma')).toBe(false);
  });
});
