import { describe, it, expect } from 'vitest';
import { findMatchingFixture } from './fixtureMatch';
import type { ApiFootballFixture } from '@/types/api';

function makeFixture(id: number, home: string, away: string): ApiFootballFixture {
  return {
    fixture: {
      id,
      date: '2026-06-20T18:00:00+00:00',
      venue: { name: null, city: null },
      status: { short: 'NS', long: 'Not Started', elapsed: null },
    },
    league: { id: 1, name: 'World Cup', round: 'Group A' },
    teams: {
      home: { id: id * 10, name: home, logo: '', winner: null },
      away: { id: id * 10 + 1, name: away, logo: '', winner: null },
    },
    goals: { home: null, away: null },
  };
}

describe('findMatchingFixture', () => {
  const fixtures = [
    makeFixture(1, 'Argentina', 'Brazil'),
    makeFixture(2, 'France', 'Germany'),
    makeFixture(3, 'Spain', 'Portugal'),
  ];

  it('matches an exact team pair', () => {
    const m = findMatchingFixture('Argentina', 'Brazil', fixtures);
    expect(m?.fixture.id).toBe(1);
  });

  it('matches regardless of home/away ordering', () => {
    const m = findMatchingFixture('Germany', 'France', fixtures);
    expect(m?.fixture.id).toBe(2);
  });

  it('returns null when no fixture is similar enough', () => {
    const m = findMatchingFixture('Japan', 'Mexico', fixtures);
    expect(m).toBeNull();
  });
});
