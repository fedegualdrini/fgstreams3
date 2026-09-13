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

  const idString = parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  let hash = 0;
  for (let i = 0; i < idString.length; i++) {
    const char = idString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function parseTeamsFromTitle(title: string): { team1: string; team2: string } {
  const separators = [' - ', ' vs. ', ' vs ', ' VS ', ' v ', ' V '];
  for (const sep of separators) {
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

export function normalizeMatches(matches: RawMatch[], now = Date.now()): Match[] {
  return matches.map(match => {
    const id = match.id ? String(match.id) : generateMatchId(match);

    // `teams` is the structured form on the all-today feed; the title only has
    // to be split when the feed omits it.
    const teamsFromTitle = match.title
      ? parseTeamsFromTitle(match.title)
      : { team1: match.team1 || '', team2: match.team2 || '' };
    const team1 = match.teams?.home?.name || match.team1 || teamsFromTitle.team1;
    const team2 = match.teams?.away?.name || match.team2 || teamsFromTitle.team2;

    let startTime: string | undefined;
    if (match.date) {
      if (typeof match.date === 'number') {
        startTime = new Date(match.date).toISOString();
      } else if (typeof match.date === 'string') {
        startTime = match.date;
      }
    } else {
      startTime = match.startTime || match.start_time || match.time;
    }

    const normalized: Match = {
      id,
      sport: match.sport || match.category || '',
      league: match.league || match.tournament || match.competition || '',
      team1,
      team2,
      startTime,
      isLive: match.isLive !== undefined ? match.isLive : (match.is_live || match.live || false),
      sources: match.sources || [],
      image1: match.image1 || match.homeImage || match.team1Image || badgePath(match.teams?.home?.badge),
      image2: match.image2 || match.awayImage || match.team2Image || badgePath(match.teams?.away?.badge),
      poster: match.poster || match.posterImage || match.posterUrl || derivedPosterPath(match),
    };

    // Streamed has no explicit live flag on the per-sport feeds, so seed it from
    // the kickoff window; callers with the live feed refine it via deriveIsLive.
    normalized.isLive = deriveIsLive(normalized, undefined, now);
    return normalized;
  });
}
