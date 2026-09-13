import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  teamTokens,
  tokenOverlap,
  teamPairScore,
  findFixture,
  estimateFeedOffsetMs,
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

describe('findFixture', () => {
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
    const found = findFixture('Talleres Cordoba', 'Union Santa Fe', kickoff, [game()]);
    expect(found?.id).toBe('g1');
  });

  it('rejects the same clubs at a different kickoff', () => {
    const found = findFixture(
      'Talleres Cordoba',
      'Union Santa Fe',
      kickoff + KICKOFF_TOLERANCE_MS + 60_000,
      [game()],
    );
    expect(found).toBeNull();
  });

  it('tolerates small kickoff drift between feeds', () => {
    const found = findFixture(
      'Talleres Cordoba', 'Union Santa Fe', kickoff + 10 * 60 * 1000, [game()],
    );
    expect(found?.id).toBe('g1');
  });

  it('returns null when no fixture is similar enough', () => {
    const found = findFixture('Arsenal', 'Chelsea', kickoff, [game()]);
    expect(found).toBeNull();
  });

  it('ignores kickoff when the match has no start time', () => {
    const found = findFixture('Talleres Cordoba', 'Union Santa Fe', undefined, [game()]);
    expect(found?.id).toBe('g1');
  });

  it('returns null without both team names', () => {
    expect(findFixture('Talleres Cordoba', '', kickoff, [game()])).toBeNull();
  });
});

describe('estimateFeedOffsetMs', () => {
  const HOUR = 60 * 60 * 1000;
  const base = Date.parse('2026-09-12T23:00:00.000Z');

  const pairs: Array<[string, string]> = [
    ['Talleres de Córdoba', 'Unión de Santa Fe'],
    ['Independiente Rivadavia', 'Aldosivi'],
    ['Estudiantes de La Plata', 'Platense'],
    ['Atlético Tucumán', 'River Plate'],
  ];

  // Promiedos fixtures as rendered in some unknown timezone.
  const gamesShiftedBy = (shift: number): PromiedosGame[] =>
    pairs.map(([home, away], i) => ({
      id: `g${i}`,
      league: 'Liga Profesional Argentina',
      leagueId: 'hc',
      countryId: 'ba',
      homeTeam: home,
      awayTeam: away,
      startTimeMs: base + i * HOUR - shift,
      networks: ['ESPN Premium'],
    }));

  // The same fixtures as Streamed names them, at their true kickoff.
  const streamedMatches = pairs.map(([home, away], i) => ({
    team1: home.replace(/ de /g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, ''),
    team2: away.replace(/ de /g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, ''),
    startMs: base + i * HOUR,
  }));

  it('recovers the offset when the feed renders in another timezone', () => {
    expect(estimateFeedOffsetMs(streamedMatches, gamesShiftedBy(-2 * HOUR))).toBe(-2 * HOUR);
  });

  it('reports zero when the feeds already agree', () => {
    expect(estimateFeedOffsetMs(streamedMatches, gamesShiftedBy(0))).toBe(0);
  });

  it('returns null without enough agreeing fixtures', () => {
    expect(estimateFeedOffsetMs(streamedMatches.slice(0, 2), gamesShiftedBy(0))).toBeNull();
  });

  it('ignores matches with no kickoff time', () => {
    const noTimes = streamedMatches.map(m => ({ ...m, startMs: NaN }));
    expect(estimateFeedOffsetMs(noTimes, gamesShiftedBy(0))).toBeNull();
  });

  it('feeds the recovered offset back into matching', () => {
    const shift = -2 * HOUR;
    const games = gamesShiftedBy(shift);
    const offsetMs = estimateFeedOffsetMs(streamedMatches, games);

    // Without the correction the fixture is two hours out and is rejected.
    expect(findFixture('Talleres Cordoba', 'Union Santa Fe', base, games)).toBeNull();
    expect(
      findFixture('Talleres Cordoba', 'Union Santa Fe', base, games, { offsetMs })?.id,
    ).toBe('g0');
  });

  it('falls back to name-only matching when the offset is unknown', () => {
    const games = gamesShiftedBy(-2 * HOUR);
    expect(
      findFixture('Talleres Cordoba', 'Union Santa Fe', base, games, { offsetMs: null })?.id,
    ).toBe('g0');
  });
});
