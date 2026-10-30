import type { Match } from '@/types/api';
import { matchStartMs } from './matchUtils';
import {
  CATALOG_FUTURE_HOURS,
  CATALOG_PAST_HOURS,
} from './constants';

/** Catalog listing windows; upstream live state is authoritative. */

const HOUR_MS = 60 * 60 * 1000;

export function isListable(match: Match, now: number): boolean {
  if (!match.team1) return false;
  if (match.isLive) return true;
  const start = matchStartMs(match, now);
  // Matches with no usable kickoff time still list — the feed marks some
  // long-running events (motorsport, fights) that way.
  if (start === undefined) return true;
  const offsetHours = (now - start) / HOUR_MS;
  return offsetHours <= CATALOG_PAST_HOURS && offsetHours >= -CATALOG_FUTURE_HOURS;
}

/** StreamFree's live sources, rather than kickoff age, determine liveness. */
export function currentLiveState(match: Match): boolean {
  return Boolean(match.isLive);
}
