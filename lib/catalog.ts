import { unstable_cache } from 'next/cache';
import type {
  AngulismoEvent, BroadcastChannel, CatalogMatch, Match, PromiedosGame, Stream,
} from '@/types/api';
import { fetchAllMatches, fetchLiveMatchIds, fetchStreamLookup } from './api';
import { normalizeMatches, matchStartMs } from './matchUtils';
import { fetchPromiedosGames } from './promiedos';
import { fetchAngulismoData } from './angulismo';
import { estimateFeedOffsetMs, findFixture } from './teamMatch';
import { getChannelCatalog } from './channelCatalog';
import type { Channel } from '@/types/channels';
import { broadcastsFromEvent, mergeBroadcasts, resolveBroadcastChannels } from './broadcasters';
import {
  CATALOG_CONCURRENCY,
  CATALOG_FUTURE_HOURS,
  CATALOG_PAST_HOURS,
  CATALOG_TIME_BUDGET_MS,
  EXTENDED_LIVE_WINDOW_HOURS,
  LIVE_WINDOW_HOURS,
  REVALIDATE_CATALOG,
} from './constants';

/**
 * The match catalog: every listable match together with the streams that
 * actually play it.
 *
 * A match's `sources` only say which providers *might* carry it — for well over
 * half of them `/stream/{source}/{id}` answers with an empty array. Resolving
 * that up front is what lets the site (a) never advertise a match nobody can
 * watch and (b) render a match page with its sources already in hand instead of
 * flashing "no streams" while the browser fetches them.
 *
 * Resolution is expensive (~470 upstream calls) so it happens inside a cached
 * function: after the first build, renders read the cache and Next refreshes it
 * in the background.
 */

const HOUR_MS = 60 * 60 * 1000;

export type { CatalogMatch };

/** Run `task` over `items` with at most `limit` in flight, stopping at `deadline`. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  task: (item: T) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results = new Array<R | undefined>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      // Past the budget, leave the rest undefined. Callers treat "unresolved"
      // as "keep the match" so a slow upstream degrades into a longer list,
      // never into an empty page.
      if (Date.now() > deadline) return;
      try {
        results[index] = await task(items[index]);
      } catch {
        results[index] = undefined;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function isListable(match: Match, now: number): boolean {
  if (!match.team1) return false;
  const start = matchStartMs(match, now);
  // Matches with no usable kickoff time still list — the feed marks some
  // long-running events (motorsport, fights) that way.
  if (start === undefined) return true;
  const offsetHours = (now - start) / HOUR_MS;
  return offsetHours <= CATALOG_PAST_HOURS && offsetHours >= -CATALOG_FUTURE_HOURS;
}

/**
 * Thrown when the upstream match feed gave us nothing at all.
 *
 * It exists to keep that result *out* of the cache. `unstable_cache` stores
 * whatever its callback returns, so returning an empty list would pin "no
 * matches available" across every visitor for a full revalidation window on the
 * strength of one failed request.
 */
class EmptyUpstreamError extends Error {
  constructor() {
    super('upstream match feed returned no matches');
    this.name = 'EmptyUpstreamError';
  }
}

async function buildCatalog(): Promise<CatalogMatch[]> {
  const now = Date.now();
  const deadline = now + CATALOG_TIME_BUDGET_MS;

  const [rawMatches, liveIds, broadcastSnapshot, angulismo, channels] = await Promise.all([
    fetchAllMatches(),
    fetchLiveMatchIds(),
    // Broadcast data is a bonus; never let either source fail the catalog.
    fetchPromiedosGames().catch(() => ({ games: [], ok: false, stale: false })),
    fetchAngulismoData().catch(() => ({ events: [], channels: [], ok: false, stale: false })),
    getChannelCatalog().catch(() => [] as Channel[]),
  ]);

  // An empty feed is a failed fetch, not a quiet day: streamed.pk lists a few
  // hundred fixtures around the clock. A day with nothing *listable* is
  // plausible and cacheable; a day with nothing at all is not.
  if (rawMatches.length === 0) throw new EmptyUpstreamError();

  // Only with a working lookup and a channel catalog can we say a match has no
  // broadcaster. Without them we know nothing, which is a different thing.
  const broadcastsKnown =
    (broadcastSnapshot.ok || angulismo.ok) && channels.length > 0;

  const matches = normalizeMatches(rawMatches, now)
    .filter(match => isListable(match, now))
    .map(match => ({ ...match, liveHint: liveIds.has(match.id) }));

  // One entry per (match, source) pair; a match is playable if any of them resolve.
  const refs = matches.flatMap((match, matchIndex) =>
    (match.sources ?? []).map(source => ({ matchIndex, source })),
  );

  const resolved = await mapWithConcurrency(
    refs,
    CATALOG_CONCURRENCY,
    deadline,
    async ({ source }) => fetchStreamLookup(source.source, source.id),
  );

  const streamsByMatch = new Map<number, Stream[]>();
  const unresolvedMatches = new Set<number>();

  refs.forEach((ref, index) => {
    const lookup = resolved[index];
    // Undefined means we ran out of time budget; ok:false means the request
    // itself failed. Either way we do not know what this source carries, so the
    // match must not be judged unwatchable on the strength of it.
    if (lookup === undefined || !lookup.ok) {
      unresolvedMatches.add(ref.matchIndex);
      return;
    }
    const bucket = streamsByMatch.get(ref.matchIndex) ?? [];
    for (const stream of lookup.streams) {
      bucket.push({ ...stream, source: stream.source || ref.source.source });
    }
    streamsByMatch.set(ref.matchIndex, bucket);
  });

  const datedMatches = matches.flatMap(match => {
    const startMs = matchStartMs(match, now);
    return startMs === undefined ? [] : [{ team1: match.team1, team2: match.team2, startMs }];
  });

  // Promiedos renders kickoff in the requesting IP's timezone, so the offset
  // between the feeds is measured once per build rather than assumed.
  const promiedosOffsetMs = estimateFeedOffsetMs(datedMatches, broadcastSnapshot.games);
  // The angulismo feed is a static file, so its Argentina-local times are the
  // same for every caller and zero is the known-correct fallback.
  const angulismoOffsetMs = estimateFeedOffsetMs(datedMatches, angulismo.events) ?? 0;

  const catalog: CatalogMatch[] = [];

  matches.forEach((match, matchIndex) => {
    const streams = streamsByMatch.get(matchIndex) ?? [];
    const broadcasts = resolveBroadcastsFor(match, channels, now, {
      promiedosGames: broadcastSnapshot.games,
      promiedosOffsetMs,
      angulismoEvents: angulismo.events,
      angulismoOffsetMs,
    });

    // Drop matches nobody can watch: no working Streamed source and no channel
    // carrying it. Two cases are deliberately kept instead:
    //   - sources we ran out of time to resolve (re-checked next rebuild);
    //   - every match, when the broadcast lookup itself failed. A live fixture
    //     whose only route is a TV channel would otherwise vanish from the site
    //     because an optional enrichment was unavailable.
    const playable = streams.length > 0 || broadcasts.length > 0;
    if (!playable && !unresolvedMatches.has(matchIndex) && broadcastsKnown) return;

    catalog.push({ ...match, streams, broadcasts, isLive: currentLiveState(match, now) });
  });

  return catalog;
}

interface BroadcastSources {
  promiedosGames: PromiedosGame[];
  promiedosOffsetMs: number | null;
  angulismoEvents: AngulismoEvent[];
  angulismoOffsetMs: number | null;
}

/**
 * Channels carrying this match, angulismo first.
 *
 * Order matters: the angulismo feed supplies working URLs for the fixture
 * itself, whereas Promiedos supplies a broadcaster name that we then resolve
 * against a catalog that may be out of date. Promiedos still contributes the
 * channels angulismo did not list, and covers far more competitions.
 */
function resolveBroadcastsFor(
  match: Match,
  channels: Channel[],
  now: number,
  sources: BroadcastSources,
): BroadcastChannel[] {
  if (!match.team2) return [];

  const startMs = matchStartMs(match, now);

  const event = findFixture(
    match.team1, match.team2, startMs, sources.angulismoEvents,
    { offsetMs: sources.angulismoOffsetMs },
  );
  const fromEvent = event ? broadcastsFromEvent(event, channels) : [];

  if (channels.length === 0) return fromEvent;

  const game = findFixture(
    match.team1, match.team2, startMs, sources.promiedosGames,
    { offsetMs: sources.promiedosOffsetMs },
  );
  const fromPromiedos = game ? resolveBroadcastChannels(game, channels) : [];

  return mergeBroadcasts(fromEvent, fromPromiedos);
}

/**
 * Liveness for the current clock. Recomputed on every read so a cached catalog
 * entry cannot leave a live badge on a finished match — or drop one from an
 * event that legitimately runs past the default window.
 */
function currentLiveState(match: Match & { liveHint: boolean }, now: number): boolean {
  const start = matchStartMs(match, now);
  if (start === undefined) return match.liveHint || Boolean(match.isLive);

  const elapsedHours = (now - start) / HOUR_MS;
  if (elapsedHours < 0) return false;
  if (elapsedHours <= LIVE_WINDOW_HOURS) return true;
  return match.liveHint && elapsedHours <= EXTENDED_LIVE_WINDOW_HOURS;
}

const getCachedCatalog = unstable_cache(buildCatalog, ['match-catalog'], {
  revalidate: REVALIDATE_CATALOG,
  tags: ['match-catalog'],
});

// Last catalog that built successfully. A warm instance can serve this while
// the upstream is down instead of showing an empty site.
let lastGoodCatalog: CatalogMatch[] | null = null;

/**
 * The catalog, with liveness recomputed against the current clock so a cached
 * entry never shows a stale live badge.
 *
 * When the upstream feed is unreachable this serves the last good catalog
 * rather than nothing: stale fixtures are a smaller failure than an empty site,
 * and the window filter below still drops anything that has since aged out.
 */
export async function getCatalog(): Promise<CatalogMatch[]> {
  const now = Date.now();

  let catalog: CatalogMatch[];
  try {
    catalog = await getCachedCatalog();
    lastGoodCatalog = catalog;
  } catch (error) {
    if (!lastGoodCatalog) {
      console.error('catalog: upstream unavailable and nothing cached to fall back on:', error);
      return [];
    }
    console.warn('catalog: upstream unavailable, serving the last good catalog:', error);
    catalog = lastGoodCatalog;
  }

  return catalog
    .filter(match => isListable(match, now))
    .map(match => ({ ...match, isLive: currentLiveState(match, now) }));
}

export async function getCatalogMatch(id: string): Promise<CatalogMatch | null> {
  const catalog = await getCatalog();
  return catalog.find(match => match.id === id) ?? null;
}

/** Live first, then by kickoff. */
export function sortCatalog(matches: CatalogMatch[]): CatalogMatch[] {
  return [...matches].sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}
