import type { PromiedosGame } from '@/types/api';

/**
 * Fuzzy matching between Streamed match titles and Promiedos fixtures.
 *
 * The two feeds name the same club differently: Streamed strips accents and
 * particles ("Talleres Cordoba", "Union Santa Fe") while Promiedos writes them
 * out ("Talleres de Córdoba", "Unión de Santa Fe"). Comparing raw strings never
 * matches, so both sides are folded to accent-free token sets and scored by
 * overlap, with kickoff time used as a hard gate.
 */

// Words that carry no identifying information for a club name.
const NOISE_TOKENS = new Set([
  'de', 'del', 'da', 'do', 'dos', 'das', 'la', 'las', 'el', 'los', 'y', 'e',
  'fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'ca', 'sd', 'ud', 'club', 'atletico',
  'atletica', 'deportivo', 'deportiva', 'sporting', 'sport', 'sports',
  'futbol', 'football', 'fk', 'sk', 'if', 'bk', 'csd', 'csyd', 'aa', 'ec',
  'se', 'fbc', 'the', 'and',
]);

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Lowercase, accent-free, punctuation-free form used for all comparisons. */
export function normalizeText(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamTokens(name: string): Set<string> {
  const tokens = normalizeText(name)
    .split(' ')
    .filter((token) => token.length > 1 && !NOISE_TOKENS.has(token));

  // A name made entirely of noise ("Atletico") would otherwise score zero
  // against everything, so fall back to the un-filtered tokens.
  if (tokens.length === 0) {
    return new Set(normalizeText(name).split(' ').filter(Boolean));
  }
  return new Set(tokens);
}

/**
 * Overlap relative to the smaller token set. Jaccard punishes "Talleres" vs
 * "Talleres Cordoba" for the extra token even though it is the same club;
 * containment does not.
 */
export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

export function teamPairScore(
  homeA: string, awayA: string,
  homeB: string, awayB: string,
): number {
  const h1 = teamTokens(homeA);
  const a1 = teamTokens(awayA);
  const h2 = teamTokens(homeB);
  const a2 = teamTokens(awayB);

  const forward = (tokenOverlap(h1, h2) + tokenOverlap(a1, a2)) / 2;
  const reverse = (tokenOverlap(h1, a2) + tokenOverlap(a1, h2)) / 2;
  return Math.max(forward, reverse);
}

export const TEAM_MATCH_THRESHOLD = 0.6;
// Feeds disagree on kickoff by a few minutes; anything past this is a different
// fixture between the same clubs (e.g. a rematch later in the week).
export const KICKOFF_TOLERANCE_MS = 45 * 60 * 1000;

/**
 * Find the Promiedos fixture for a Streamed match. Returns null unless both the
 * team names and the kickoff time agree — a wrong match would attach the wrong
 * TV channel, which is worse than attaching none.
 */
export function findPromiedosGame(
  team1: string,
  team2: string,
  startTimeMs: number | undefined,
  games: PromiedosGame[],
  threshold = TEAM_MATCH_THRESHOLD,
): PromiedosGame | null {
  if (!team1 || !team2) return null;

  let best: PromiedosGame | null = null;
  let bestScore = 0;

  for (const game of games) {
    if (startTimeMs !== undefined && Number.isFinite(startTimeMs)) {
      if (Math.abs(game.startTimeMs - startTimeMs) > KICKOFF_TOLERANCE_MS) continue;
    }

    const score = teamPairScore(team1, team2, game.homeTeam, game.awayTeam);
    if (score > bestScore) {
      bestScore = score;
      best = game;
    }
  }

  return bestScore >= threshold ? best : null;
}
