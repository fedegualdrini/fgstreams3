import { describe, it, expect } from 'vitest';
import { generateMatchId, normalizeMatches } from './matchUtils';
import type { RawMatch } from '@/types/api';

describe('generateMatchId', () => {
  it('returns existing id when present', () => {
    expect(generateMatchId({ id: 'abc123' })).toBe('abc123');
  });

  it('generates a deterministic id from match fields', () => {
    const match = { sport: 'football', league: 'Premier League', team1: 'Arsenal', team2: 'Chelsea', startTime: '2025-01-01T15:00:00Z' };
    const id1 = generateMatchId(match);
    const id2 = generateMatchId(match);
    expect(id1).toBe(id2);
  });

  it('generates different ids for different matches', () => {
    const a = generateMatchId({ sport: 'football', team1: 'Arsenal', team2: 'Chelsea' });
    const b = generateMatchId({ sport: 'football', team1: 'Liverpool', team2: 'Everton' });
    expect(a).not.toBe(b);
  });

  it('returns a non-empty string', () => {
    expect(generateMatchId({ sport: 'tennis' }).length).toBeGreaterThan(0);
  });
});

describe('normalizeMatches', () => {
  const base: RawMatch = {
    id: '1',
    sport: 'football',
    league: 'Premier League',
    team1: 'Arsenal',
    team2: 'Chelsea',
    sources: [{ source: 'streamed', id: 'abc' }],
  };

  it('normalizes a basic match', () => {
    const [m] = normalizeMatches([base]);
    expect(m.id).toBe('1');
    expect(m.sport).toBe('football');
    expect(m.team1).toBe('Arsenal');
    expect(m.team2).toBe('Chelsea');
    expect(m.sources).toHaveLength(1);
  });

  it('parses team names from title field', () => {
    const [m] = normalizeMatches([{ ...base, id: undefined, title: 'Liverpool - Everton', team1: undefined, team2: undefined }]);
    expect(m.team1).toBe('Liverpool');
    expect(m.team2).toBe('Everton');
  });

  it('parses title with vs separator', () => {
    const [m] = normalizeMatches([{ ...base, id: undefined, title: 'Man City vs Man Utd', team1: undefined, team2: undefined }]);
    expect(m.team1).toBe('Man City');
    expect(m.team2).toBe('Man Utd');
  });

  it('infers isLive from numeric date within last 3 hours', () => {
    const recentDate = Date.now() - 30 * 60 * 1000; // 30 minutes ago
    const [m] = normalizeMatches([{ ...base, date: recentDate }]);
    expect(m.isLive).toBe(true);
  });

  it('infers isLive=false for date more than 3 hours ago', () => {
    const oldDate = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago
    const [m] = normalizeMatches([{ ...base, date: oldDate }]);
    expect(m.isLive).toBe(false);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeMatches([])).toEqual([]);
  });

  it('uses league from tournament field as fallback', () => {
    const [m] = normalizeMatches([{ ...base, league: undefined, tournament: 'Champions League' }]);
    expect(m.league).toBe('Champions League');
  });
});
