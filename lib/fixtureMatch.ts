import type { ApiFootballFixture } from '@/types/api';
import { normalizeTeamName } from './scoreUtils';

// Token set for a team name, reusing the shared normalizer so aliases/suffix
// stripping stay consistent with the Flashscore matcher.
function tokenize(name: string): Set<string> {
  return new Set(
    normalizeTeamName(name)
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the API-Football fixture that best matches a pair of Streamed team names.
 * Tries both home/away orderings. Returns null below the similarity threshold so
 * an unmatched stream simply shows no official stats rather than wrong ones.
 */
export function findMatchingFixture(
  team1: string,
  team2: string,
  fixtures: ApiFootballFixture[],
  threshold = 0.4,
): ApiFootballFixture | null {
  const t1 = tokenize(team1);
  const t2 = tokenize(team2);

  let best: ApiFootballFixture | null = null;
  let bestScore = -1;

  for (const fixture of fixtures) {
    const home = tokenize(fixture.teams.home.name);
    const away = tokenize(fixture.teams.away.name);

    const forward = (jaccard(t1, home) + jaccard(t2, away)) / 2;
    const reverse = (jaccard(t1, away) + jaccard(t2, home)) / 2;
    const score = Math.max(forward, reverse);

    if (score > bestScore) {
      bestScore = score;
      best = fixture;
    }
  }

  return bestScore >= threshold ? best : null;
}
