import type { Match, RawMatch } from '@/types/api';
import { LIVE_WINDOW_HOURS } from './constants';

const HOUR_MS = 60 * 60 * 1000;

// streamed.pk occasionally emits nonsense epochs (values decades away from now).
// Anything outside this band is treated as "no kickoff time" instead of being
// sorted to one end of the listing.
const MAX_PLAUSIBLE_OFFSET_MS = 400 * 24 * HOUR_MS;

export function generateMatchId(match: Partial<Match>): string {
  if (match.id) return String(match.id);

  const parts = [
    match.sport,
    match.league,
    match.team1,
    match.team2,
    match.startTime,
  ].filter(Boolean);

  if (match.sources && match.sources.length > 0) {
    parts.push(match.sources[0].id);
  }

  return hashToBase36(parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-'));
}

/** 32-bit string hash (`h * 31 + c`), rendered compactly for use in URLs. */
function hashToBase36(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

const TITLE_SEPARATORS = [' - ', ' vs. ', ' vs ', ' VS ', ' v ', ' V '];

function parseTeamsFromTitle(title: string): { team1: string; team2: string } {
  for (const sep of TITLE_SEPARATORS) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      return {
        team1: parts[0]?.trim() || '',
        team2: parts[1]?.trim() || '',
      };
    }
  }
  return { team1: title, team2: '' };
}

/** Kickoff as epoch ms, or undefined when it is missing or implausible. */
export function matchStartMs(match: Pick<Match, 'startTime'>, now = Date.now()): number | undefined {
  if (!match.startTime) return undefined;
  const parsed = new Date(match.startTime).getTime();
  if (!Number.isFinite(parsed)) return undefined;
  if (Math.abs(parsed - now) > MAX_PLAUSIBLE_OFFSET_MS) return undefined;
  return parsed;
}

/**
 * Whether a match should be presented as live right now.
 *
 * `liveIds` comes from the upstream live feed and is authoritative. The kickoff
 * window is only a fallback for matches that feed has not caught up with — it is
 * recomputed on every render, so a cached page can never freeze the live badge.
 */
export function deriveIsLive(
  match: Match,
  liveIds?: ReadonlySet<string>,
  now = Date.now(),
): boolean {
  if (liveIds?.has(match.id)) return true;

  const start = matchStartMs(match, now);
  if (start === undefined) return match.isLive ?? false;

  const elapsedHours = (now - start) / HOUR_MS;
  return elapsedHours >= 0 && elapsedHours <= LIVE_WINDOW_HOURS;
}

/** streamed.pk serves team crests from an opaque badge token. */
function badgePath(badge: string | undefined | null): string | undefined {
  return badge ? `/api/images/badge/${badge}.webp` : undefined;
}

/**
 * Fewer than half the matches on the all-today feed carry a `poster`, but most
 * carry both team badges — and streamed.pk composes a poster from the pair.
 */
function derivedPosterPath(match: RawMatch): string | undefined {
  const home = match.teams?.home?.badge;
  const away = match.teams?.away?.badge;
  return home && away ? `/api/images/poster/${home}/${away}.webp` : undefined;
}

/**
 * `teams` is the structured form on the all-today feed; the title only has to
 * be split when the feed omits it.
 */
function resolveTeams(raw: RawMatch): { team1: string; team2: string } {
  const fromTitle = raw.title
    ? parseTeamsFromTitle(raw.title)
    : { team1: raw.team1 || '', team2: raw.team2 || '' };
  return {
    team1: raw.teams?.home?.name || raw.team1 || fromTitle.team1,
    team2: raw.teams?.away?.name || raw.team2 || fromTitle.team2,
  };
}

/** `date` (epoch ms or string) wins; the other time fields are only read when it is absent. */
function resolveStartTime(raw: RawMatch): string | undefined {
  if (!raw.date) return raw.startTime || raw.start_time || raw.time;
  if (typeof raw.date === 'number') return new Date(raw.date).toISOString();
  return raw.date;
}

function normalizeMatch(raw: RawMatch, now: number): Match {
  const { team1, team2 } = resolveTeams(raw);

  const normalized: Match = {
    id: raw.id ? String(raw.id) : generateMatchId(raw),
    sport: raw.sport || raw.category || '',
    league: raw.league || raw.tournament || raw.competition || '',
    team1,
    team2,
    startTime: resolveStartTime(raw),
    isLive: raw.isLive !== undefined ? raw.isLive : (raw.is_live || raw.live || false),
    sources: raw.sources || [],
    image1: raw.image1 || raw.homeImage || raw.team1Image || badgePath(raw.teams?.home?.badge),
    image2: raw.image2 || raw.awayImage || raw.team2Image || badgePath(raw.teams?.away?.badge),
    poster: raw.poster || raw.posterImage || raw.posterUrl || derivedPosterPath(raw),
  };

  // Streamed has no explicit live flag on the per-sport feeds, so seed it from
  // the kickoff window; callers with the live feed refine it via deriveIsLive.
  normalized.isLive = deriveIsLive(normalized, undefined, now);
  return normalized;
}

export function normalizeMatches(matches: RawMatch[], now = Date.now()): Match[] {
  return matches.map((raw) => normalizeMatch(raw, now));
}
