import type { AngulismoSnapshot, Match } from '@/types/api';
import type { Channel } from '@/types/channels';
import { fetchAllMatches, fetchStreamLookup } from './api';
import { fetchAngulismoData } from './angulismo';
import { getCatalog } from './catalog';
import {
  buildBroadcastSources,
  findFeedFixtures,
  resolveFeedBroadcasts,
  type BroadcastSources,
} from './catalogBroadcasts';
import { getChannelCatalog, getStaticChannelCatalog } from './channelCatalog';
import { DIAGNOSTICS_PROBE_TIMEOUT_MS } from './constants';
import { normalizeMatches } from './matchUtils';
import {
  extractNextData,
  fetchPromiedosGames,
  parsePromiedosPayload,
  PROMIEDOS_BASE,
  PROMIEDOS_HEADERS,
  PROMIEDOS_PAGES,
  type PromiedosSnapshot,
} from './promiedos';

/**
 * Report builders behind GET /api/diagnostics/broadcasts.
 *
 * The stages are reported separately on purpose: a raw page probe only proves
 * the host is reachable, and says nothing about whether a fixture then matched
 * or which channels resolved from it. Everything reads through the same caches
 * the site uses, so the endpoint stays cheap enough to leave unauthenticated.
 */

const HOUR_MS = 60 * 60 * 1000;
/** Matches traced in full per query; each costs one request per stream source. */
const MAX_TRACED_MATCHES = 3;
/** Bytes of a probed page echoed back, enough to recognise a bot interstitial. */
const BODY_HEAD_LENGTH = 160;

const NO_ANGULISMO: AngulismoSnapshot = { events: [], channels: [], ok: false, stale: false };

const matchesQuery = (query: string, ...fields: Array<string | undefined>) =>
  fields.some(field => (field ?? '').toLowerCase().includes(query));

// ─── Inputs ─────────────────────────────────────────────────────────────────

/** Raw reachability of one Promiedos page: either the response facts or the error. */
export interface PageProbe {
  path: string;
  ms: number;
  status?: number;
  bytes?: number;
  nextDataFound?: boolean;
  fixturesWithTv?: number;
  bodyHead?: string;
  error?: string;
}

async function probePage(path: string): Promise<PageProbe> {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${PROMIEDOS_BASE}${path}`, {
      headers: PROMIEDOS_HEADERS,
      signal: AbortSignal.timeout(DIAGNOSTICS_PROBE_TIMEOUT_MS),
      cache: 'no-store',
    });
    const body = await response.text();
    const payload = extractNextData(body);

    return {
      path,
      ms: Date.now() - startedAt,
      status: response.status,
      bytes: body.length,
      nextDataFound: payload !== null,
      fixturesWithTv: payload ? parsePromiedosPayload(payload).length : 0,
      bodyHead: body.slice(0, BODY_HEAD_LENGTH),
    };
  } catch (error) {
    return {
      path,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

export interface BroadcastInputs {
  pageProbes: PageProbe[];
  channels: Channel[];
  staticChannels: Channel[];
  angulismo: AngulismoSnapshot;
  promiedos: PromiedosSnapshot;
  /** Set when the Promiedos lookup threw instead of returning a snapshot. */
  promiedosError?: string;
}

/** Everything the broadcast pipeline reads, fetched once and shared by both report levels. */
export async function loadBroadcastInputs(): Promise<BroadcastInputs> {
  const [pageProbes, channels, staticChannels, angulismo] = await Promise.all([
    Promise.all(PROMIEDOS_PAGES.map(probePage)),
    getChannelCatalog().catch((): Channel[] => []),
    getStaticChannelCatalog().catch((): Channel[] => []),
    fetchAngulismoData().catch(() => NO_ANGULISMO),
  ]);

  // The same call the catalog makes, rather than a hand-rolled fetch.
  let promiedos: PromiedosSnapshot = { games: [], ok: false, stale: false };
  let promiedosError: string | undefined;
  try {
    promiedos = await fetchPromiedosGames();
  } catch (error) {
    promiedosError = String(error);
  }

  return { pageProbes, channels, staticChannels, angulismo, promiedos, promiedosError };
}

// ─── Reports ────────────────────────────────────────────────────────────────

/** Is the pipeline reachable and populated? Answered without any query. */
export function summarizeInputs(inputs: BroadcastInputs) {
  const { pageProbes, channels, staticChannels, angulismo, promiedos, promiedosError } = inputs;

  return {
    region: process.env.VERCEL_REGION ?? 'local',
    channelCatalog: {
      shipped: staticChannels.length,
      afterLiveRefresh: channels.length,
      refreshed: channels.length !== staticChannels.length || angulismo.ok,
    },
    pageProbes,
    promiedos: {
      ok: promiedos.ok,
      stale: promiedos.stale,
      fixtures: promiedos.games.length,
      error: promiedosError,
    },
    angulismo: {
      ok: angulismo.ok,
      stale: angulismo.stale,
      events: angulismo.events.length,
      channels: angulismo.channels.length,
    },
  };
}

/** One match walked through every stage: streams, feed fixtures, resolved channels. */
async function traceMatch(match: Match, now: number, sources: BroadcastSources, channels: Channel[]) {
  const lookups = await Promise.all(
    (match.sources ?? []).map(source => fetchStreamLookup(source.source, source.id)),
  );
  const feeds = findFeedFixtures(match, now, sources);
  const { event, fixture } = feeds;

  return {
    id: match.id,
    teams: `${match.team1} vs ${match.team2}`,
    startTime: match.startTime,
    sources: match.sources,
    resolvedStreams: lookups.flatMap(lookup => lookup.streams).length,
    // A source whose lookup failed tells us nothing; one that succeeded with
    // no streams tells us the source is genuinely carrying nothing.
    failedLookups: lookups.filter(lookup => !lookup.ok).length,
    promiedosFixture: fixture
      ? { league: fixture.league, leagueId: fixture.leagueId, networks: fixture.networks }
      : null,
    angulismoEvent: event
      ? { competition: event.competition, channels: event.channels.map(c => `${c.name}(${c.options.length})`) }
      : null,
    resolvedBroadcasts: resolveFeedBroadcasts(feeds, channels)
      .map(broadcast => `${broadcast.channel}(${broadcast.options.length})`),
  };
}

/** Trace the matches whose teams contain `query` through the pipeline, and show what the catalog made of them. */
export async function traceQuery(query: string, inputs: BroadcastInputs) {
  const { promiedos, angulismo, channels } = inputs;
  const now = Date.now();

  const rawMatches = await fetchAllMatches();
  const normalized = normalizeMatches(rawMatches, now);
  const hits = normalized.filter(match => matchesQuery(query, match.team1, match.team2));

  // Promiedos localises kickoff to the requesting IP, so the feeds' clocks are
  // aligned by measurement. A non-zero value here is the region showing itself.
  const sources = buildBroadcastSources(normalized, promiedos.games, angulismo.events, now);
  const { promiedosOffsetMs, angulismoOffsetMs } = sources;

  const traced = await Promise.all(
    hits.slice(0, MAX_TRACED_MATCHES).map(match => traceMatch(match, now, sources, channels)),
  );
  const catalog = await getCatalog();

  return {
    query,
    // An empty feed here is what empties the site, so it is worth reporting on
    // its own rather than inferring it from a zero-length catalog.
    upstreamFeed: { matches: rawMatches.length, listable: normalized.length },
    feedOffset: {
      promiedosMs: promiedosOffsetMs,
      promiedosHours: promiedosOffsetMs === null ? null : promiedosOffsetMs / HOUR_MS,
      angulismoHours: (angulismoOffsetMs ?? 0) / HOUR_MS,
    },
    promiedosFixturesMatching: promiedos.games
      .filter(game => matchesQuery(query, game.homeTeam, game.awayTeam))
      .map(game => ({ teams: `${game.homeTeam} vs ${game.awayTeam}`, start: game.startTimeMs, tv: game.networks })),
    rawFeed: traced,
    catalog: {
      size: catalog.length,
      matching: catalog
        .filter(match => matchesQuery(query, match.team1, match.team2))
        .map(match => ({
          id: match.id,
          streams: match.streams.length,
          broadcasts: match.broadcasts.map(broadcast => broadcast.channel),
        })),
    },
  };
}
