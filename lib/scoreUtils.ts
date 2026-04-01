import type { FlashscoreEntry } from '@/types/api';
import { TEAM_ALIASES } from './scoreAliases';

// Normalise a team name for fuzzy comparison:
// lowercase, strip common suffixes, apply aliases, collapse spaces.
export function normalizeTeamName(name: string): string {
  let n = name.toLowerCase().trim();

  // Apply alias map first
  if (TEAM_ALIASES[n]) n = TEAM_ALIASES[n];

  // Strip trailing suffixes (only when they appear at the end as whole words)
  n = n
    .replace(/\b(f\.?c\.?|a\.?f\.?c\.?|s\.?c\.?|c\.?f\.?|r\.?f\.?c\.?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return n;
}

function tokenize(name: string): Set<string> {
  return new Set(
    normalizeTeamName(name)
      .split(/\s+/)
      .filter((t) => t.length > 1)  // ignore single chars
  );
}

// Jaccard similarity between two token sets.
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// Find the best-matching FlashscoreEntry for a given pair of Streamed team names.
// Returns null if no entry scores above the similarity threshold.
export function findMatchingEntry(
  team1: string,
  team2: string,
  entries: FlashscoreEntry[],
  threshold = 0.4,
): FlashscoreEntry | null {
  const t1 = tokenize(team1);
  const t2 = tokenize(team2);

  let best: FlashscoreEntry | null = null;
  let bestScore = -1;

  for (const entry of entries) {
    const e1 = tokenize(entry.team1);
    const e2 = tokenize(entry.team2);

    // Try both orderings (some APIs swap home/away)
    const forward = (jaccard(t1, e1) + jaccard(t2, e2)) / 2;
    const reverse = (jaccard(t1, e2) + jaccard(t2, e1)) / 2;
    const score = Math.max(forward, reverse);

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore >= threshold ? best : null;
}
