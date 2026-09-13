/**
 * Fuzzy matching between Streamed match titles and an external fixture list.
 *
 * Feeds name the same club differently: Streamed strips accents and particles
 * ("Talleres Cordoba", "Union Santa Fe") where others write them out ("Talleres
 * de Córdoba", "Unión de Santa Fe"). Comparing raw strings never matches, so
 * both sides are folded to accent-free token sets and scored by overlap, with
 * kickoff time used as a hard gate.
 */

/** The minimum any fixture list must provide to be matched against. */
export interface Fixture {
  homeTeam: string;
  awayTeam: string;
  startTimeMs: number;
}

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
// Names alone have to carry the decision when kickoff cannot be compared, so
// the bar is higher there.
export const STRONG_TEAM_MATCH_THRESHOLD = 0.85;
// Feeds disagree on kickoff by a few minutes; anything past this is a different
// fixture between the same clubs (e.g. a rematch later in the week).
export const KICKOFF_TOLERANCE_MS = 45 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
// Timezone offsets are whole quarter-hours, so candidate deltas round to these.
const OFFSET_BUCKET_MS = 15 * MINUTE_MS;
const MAX_PLAUSIBLE_OFFSET_MS = 14 * 60 * MINUTE_MS;
const MIN_OFFSET_SAMPLES = 3;

/**
 * Estimate the constant clock offset between the two feeds.
 *
 * Promiedos renders kickoff in the *viewer's* timezone, inferred from the
 * requesting IP — so the same fixture reads 20:00 from Buenos Aires and 18:00
 * from a US datacenter. Hard-coding a timezone therefore breaks the moment the
 * code runs anywhere else, and a serverless region is not ours to pin.
 *
 * Instead the offset is measured: fixtures whose names match unambiguously vote
 * on the delta, and the most popular quarter-hour bucket wins. That is correct
 * from any region and survives DST on either side.
 *
 * Returns null when too few fixtures agree to be confident.
 */
export function estimateFeedOffsetMs(
  matches: Array<{ team1: string; team2: string; startMs: number }>,
  games: Fixture[],
): number | null {
  const votes = new Map<number, number>();

  for (const match of matches) {
    if (!match.team1 || !match.team2 || !Number.isFinite(match.startMs)) continue;

    let best: Fixture | null = null;
    let bestScore = 0;
    let ambiguous = false;

    for (const game of games) {
      const score = teamPairScore(match.team1, match.team2, game.homeTeam, game.awayTeam);
      if (score > bestScore) {
        bestScore = score;
        best = game;
        ambiguous = false;
      } else if (score === bestScore && score > 0) {
        ambiguous = true;
      }
    }

    // Only unambiguous, high-confidence pairs get a vote: one bad pairing
    // should never be able to shift the whole feed.
    if (!best || ambiguous || bestScore < STRONG_TEAM_MATCH_THRESHOLD) continue;

    const delta = match.startMs - best.startTimeMs;
    if (Math.abs(delta) > MAX_PLAUSIBLE_OFFSET_MS) continue;

    const bucket = Math.round(delta / OFFSET_BUCKET_MS) * OFFSET_BUCKET_MS;
    votes.set(bucket, (votes.get(bucket) ?? 0) + 1);
  }

  let winner: number | null = null;
  let winningVotes = 0;
  for (const [bucket, count] of votes) {
    if (count > winningVotes) {
      winningVotes = count;
      winner = bucket;
    }
  }

  return winningVotes >= MIN_OFFSET_SAMPLES ? winner : null;
}

export interface FindFixtureOptions {
  /**
   * Clock offset to add to Promiedos kickoffs before comparing, from
   * `estimateFeedOffsetMs`. null disables the time gate — the offset is unknown,
   * so comparing times would reject every correct match.
   */
  offsetMs?: number | null;
  threshold?: number;
}

/**
 * Find the fixture matching a Streamed match. A wrong match attaches the wrong
 * TV channel, which is worse than attaching none, so the names must agree and —
 * when the feeds' clocks can be aligned — so must the kickoff.
 */
export function findFixture<T extends Fixture>(
  team1: string,
  team2: string,
  startTimeMs: number | undefined,
  games: T[],
  options: FindFixtureOptions = {},
): T | null {
  if (!team1 || !team2) return null;

  const { offsetMs = 0 } = options;
  const compareTimes =
    offsetMs !== null && startTimeMs !== undefined && Number.isFinite(startTimeMs);
  const threshold =
    options.threshold ?? (compareTimes ? TEAM_MATCH_THRESHOLD : STRONG_TEAM_MATCH_THRESHOLD);

  let best: T | null = null;
  let bestScore = 0;

  for (const game of games) {
    if (compareTimes) {
      const fixtureStart = game.startTimeMs + (offsetMs as number);
      if (Math.abs(fixtureStart - (startTimeMs as number)) > KICKOFF_TOLERANCE_MS) continue;
    }

    const score = teamPairScore(team1, team2, game.homeTeam, game.awayTeam);
    if (score > bestScore) {
      bestScore = score;
      best = game;
    }
  }

  return bestScore >= threshold ? best : null;
}
