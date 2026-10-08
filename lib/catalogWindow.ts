import type { Match } from '@/types/api';
import { matchStartMs } from './matchUtils';
import {
  CATALOG_FUTURE_HOURS,
  CATALOG_PAST_HOURS,
  EXTENDED_LIVE_WINDOW_HOURS,
  LIVE_WINDOW_HOURS,
} from './constants';

/** Time-window rules for the catalog: which matches are listed, and which are live right now. */

const HOUR_MS = 60 * 60 * 1000;

export function isListable(match: Match, now: number): boolean {
  if (!match.team1) return false;
  const start = matchStartMs(match, now);
  // Matches with no usable kickoff time still list — the feed marks some
  // long-running events (motorsport, fights) that way.
  if (start === undefined) return true;
  const offsetHours = (now - start) / HOUR_MS;
  return offsetHours <= CATALOG_PAST_HOURS && offsetHours >= -CATALOG_FUTURE_HOURS;
}

/**
 * Liveness for the current clock. Recomputed on every read so a cached catalog
 * entry cannot leave a live badge on a finished match — or drop one from an
 * event that legitimately runs past the default window.
 */
export function currentLiveState(match: Match & { liveHint: boolean }, now: number): boolean {
  const start = matchStartMs(match, now);
  if (start === undefined) return match.liveHint || Boolean(match.isLive);

  const elapsedHours = (now - start) / HOUR_MS;
  if (elapsedHours < 0) return false;
  if (elapsedHours <= LIVE_WINDOW_HOURS) return true;
  return match.liveHint && elapsedHours <= EXTENDED_LIVE_WINDOW_HOURS;
}
