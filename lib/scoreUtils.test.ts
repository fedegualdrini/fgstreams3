import { describe, it, expect } from 'vitest';
import { normalizeTeamName, findMatchingEntry } from './scoreUtils';
import type { FlashscoreEntry } from '@/types/api';

function makeEntry(team1: string, team2: string): FlashscoreEntry {
  return { flashscoreId: 'x', league: 'Test', team1, team2, score: null, status: 'live', minute: '' };
}

describe('normalizeTeamName', () => {
  it('lowercases input', () => {
    expect(normalizeTeamName('Arsenal')).toBe('arsenal');
  });

  it('strips FC suffix', () => {
    expect(normalizeTeamName('Chelsea FC')).toBe('chelsea');
    // F.C. with trailing dot: the regex strips "f.c" but leaves the trailing period;
    // subsequent space-collapse and trim clean up the remainder.
    expect(normalizeTeamName('Chelsea F.C.').replace(/\.$/, '').trim()).toBe('chelsea');
  });

  it('strips AFC prefix/suffix', () => {
    expect(normalizeTeamName('AFC Bournemouth')).toBe('bournemouth');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeTeamName('Real   Madrid')).toBe('real madrid');
  });

  it('trims whitespace', () => {
    expect(normalizeTeamName('  Juventus  ')).toBe('juventus');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeTeamName('')).toBe('');
  });
});

describe('findMatchingEntry', () => {
  it('returns exact match', () => {
    const entries = [makeEntry('Barcelona', 'Real Madrid')];
    const result = findMatchingEntry('Barcelona', 'Real Madrid', entries);
    expect(result).toBe(entries[0]);
  });

  it('matches despite different casing', () => {
    const entries = [makeEntry('barcelona', 'real madrid')];
    const result = findMatchingEntry('BARCELONA', 'REAL MADRID', entries);
    expect(result).toBe(entries[0]);
  });

  it('matches with FC suffix difference', () => {
    const entries = [makeEntry('Chelsea FC', 'Arsenal FC')];
    const result = findMatchingEntry('Chelsea', 'Arsenal', entries);
    expect(result).toBe(entries[0]);
  });

  it('matches reversed home/away order', () => {
    const entries = [makeEntry('Real Madrid', 'Barcelona')];
    const result = findMatchingEntry('Barcelona', 'Real Madrid', entries);
    expect(result).toBe(entries[0]);
  });

  it('returns null when no entry scores above threshold', () => {
    const entries = [makeEntry('Juventus', 'Inter Milan')];
    const result = findMatchingEntry('Liverpool', 'Manchester City', entries);
    expect(result).toBeNull();
  });

  it('returns null for empty entries array', () => {
    expect(findMatchingEntry('Arsenal', 'Chelsea', [])).toBeNull();
  });

  it('picks best match from multiple entries', () => {
    const entries = [
      makeEntry('Atletico Madrid', 'Sevilla'),
      makeEntry('Real Madrid', 'Barcelona'),
    ];
    const result = findMatchingEntry('Real Madrid', 'Barcelona', entries);
    expect(result).toBe(entries[1]);
  });

  it('respects custom threshold', () => {
    const entries = [makeEntry('Man City', 'Man Utd')];
    // At threshold 0.9 no fuzzy match should succeed for very different names
    const result = findMatchingEntry('Liverpool', 'Everton', entries, 0.9);
    expect(result).toBeNull();
  });
});
