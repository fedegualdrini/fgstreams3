import type { Match, RawMatch } from '@/types/api';
import { STREAMFREE_SOURCE, toStreamFreeSources } from './streamfree';

const HOUR_MS = 60 * 60 * 1000;

// Treat kickoff times far outside the catalog's useful horizon as missing.
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

/** Prefer structured team names, falling back to the stream's display name. */
function resolveTeams(raw: RawMatch): { team1: string; team2: string } {
  const fromTitle = parseTeamsFromTitle(raw.name);
  return {
    team1: raw.team1?.name || fromTitle.team1,
    team2: raw.team2?.name || fromTitle.team2,
  };
}

/** StreamFree timestamps are Unix seconds; absent or invalid times stay absent. */
function resolveStartTime(raw: RawMatch): string | undefined {
  if (!raw.match_timestamp) return undefined;
  const date = new Date(raw.match_timestamp * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function normalizeMatch(raw: RawMatch): Match {
  const { team1, team2 } = resolveTeams(raw);

  return {
    id: raw.stream_key,
    sport: raw.category,
    league: raw.league || '',
    team1,
    team2,
    startTime: resolveStartTime(raw),
    isLive: raw.live_sources.length > 0,
    sources: [{
      source: STREAMFREE_SOURCE,
      id: raw.stream_key,
      streams: toStreamFreeSources(raw),
    }],
    image1: raw.team1?.logo || undefined,
    image2: raw.team2?.logo || undefined,
    poster: raw.thumbnail_url || undefined,
  };
}

export function normalizeMatches(matches: RawMatch[]): Match[] {
  return matches.map(normalizeMatch);
}
