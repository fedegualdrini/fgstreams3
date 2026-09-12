import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  teamTokens,
  tokenOverlap,
  teamPairScore,
  findPromiedosGame,
  KICKOFF_TOLERANCE_MS,
} from './teamMatch';
import type { PromiedosGame } from '@/types/api';

describe('normalizeText', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalizeText('Unión de Santa Fe')).toBe('union de santa fe');
    expect(normalizeText('Talleres (Córdoba)')).toBe('talleres cordoba');
  });
});

describe('teamTokens', () => {
  it('drops particles and club-type noise', () => {
    expect([...teamTokens('Talleres de Córdoba')]).toEqual(['talleres', 'cordoba']);
    expect([...teamTokens('Club Atlético River Plate')]).toEqual(['river', 'plate']);
  });

  it('falls back to raw tokens when a name is all noise', () => {
    expect(teamTokens('Atletico').size).toBeGreaterThan(0);
  });
});

describe('tokenOverlap', () => {
  it('scores a subset as a full match', () => {
    expect(tokenOverlap(teamTokens('Talleres'), teamTokens('Talleres de Córdoba'))).toBe(1);
  });

  it('scores unrelated names at zero', () => {
    expect(tokenOverlap(teamTokens('Boca Juniors'), teamTokens('Arsenal'))).toBe(0);
  });
});

describe('teamPairScore', () => {
  it('matches the accent-free Streamed spelling to the Promiedos one', () => {
    const score = teamPairScore(
      'Talleres Cordoba', 'Union Santa Fe',
      'Talleres de Córdoba', 'Unión de Santa Fe',
    );
    expect(score).toBe(1);
  });

  it('matches when home and away are swapped', () => {
    const score = teamPairScore(
      'Union Santa Fe', 'Talleres Cordoba',
      'Talleres de Córdoba', 'Unión de Santa Fe',
    );
    expect(score).toBe(1);
  });

  it('scores a different fixture low', () => {
    const score = teamPairScore(
      'Boca Juniors', 'River Plate',
      'Talleres de Córdoba', 'Unión de Santa Fe',
    );
    expect(score).toBe(0);
  });
});

describe('findPromiedosGame', () => {
  const kickoff = Date.parse('2026-09-12T23:00:00.000Z');

  const game = (overrides: Partial<PromiedosGame> = {}): PromiedosGame => ({
    id: 'g1',
    league: 'Liga Profesional Argentina',
    leagueId: 'hc',
    countryId: 'ba',
    homeTeam: 'Talleres de Córdoba',
    awayTeam: 'Unión de Santa Fe',
    startTimeMs: kickoff,
    networks: ['TNT Sports Premium'],
    ...overrides,
  });

  it('finds the fixture despite different spellings', () => {
    const found = findPromiedosGame('Talleres Cordoba', 'Union Santa Fe', kickoff, [game()]);
    expect(found?.id).toBe('g1');
  });

  it('rejects the same clubs at a different kickoff', () => {
    const found = findPromiedosGame(
      'Talleres Cordoba',
      'Union Santa Fe',
      kickoff + KICKOFF_TOLERANCE_MS + 60_000,
      [game()],
    );
    expect(found).toBeNull();
  });

  it('tolerates small kickoff drift between feeds', () => {
    const found = findPromiedosGame(
      'Talleres Cordoba', 'Union Santa Fe', kickoff + 10 * 60 * 1000, [game()],
    );
    expect(found?.id).toBe('g1');
  });

  it('returns null when no fixture is similar enough', () => {
    const found = findPromiedosGame('Arsenal', 'Chelsea', kickoff, [game()]);
    expect(found).toBeNull();
  });

  it('ignores kickoff when the match has no start time', () => {
    const found = findPromiedosGame('Talleres Cordoba', 'Union Santa Fe', undefined, [game()]);
    expect(found?.id).toBe('g1');
  });

  it('returns null without both team names', () => {
    expect(findPromiedosGame('Talleres Cordoba', '', kickoff, [game()])).toBeNull();
  });
});
