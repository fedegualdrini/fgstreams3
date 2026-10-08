import { unstable_cache } from 'next/cache';
import type { AngulismoSnapshot, CatalogMatch } from '@/types/api';
import type { Channel } from '@/types/channels';
import { fetchAllMatches, fetchLiveMatchIds } from './api';
import { normalizeMatches } from './matchUtils';
import { fetchPromiedosGames, type PromiedosSnapshot } from './promiedos';
import { fetchAngulismoData } from './angulismo';
import { getChannelCatalog } from './channelCatalog';
import { buildBroadcastSources, findFeedFixtures, resolveFeedBroadcasts } from './catalogBroadcasts';
import { resolveStreams } from './catalogStreams';
import { currentLiveState, isListable } from './catalogWindow';
import { CATALOG_TIME_BUDGET_MS, REVALIDATE_CATALOG } from './constants';
import { createLogger } from './logger';

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
 *
 * The pieces live next to this file: catalogWindow (what is listed / live),
 * catalogStreams (stream resolution), catalogBroadcasts (TV channel matching).
 */

const log = createLogger('catalog');

export type { CatalogMatch };

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

// Broadcast data is a bonus; neither source is allowed to fail the catalog.
const NO_PROMIEDOS: PromiedosSnapshot = { games: [], ok: false, stale: false };
const NO_ANGULISMO: AngulismoSnapshot = { events: [], channels: [], ok: false, stale: false };

async function buildCatalog(): Promise<CatalogMatch[]> {
  const now = Date.now();
  const deadline = now + CATALOG_TIME_BUDGET_MS;

  const [rawMatches, liveIds, promiedos, angulismo, channels] = await Promise.all([
    fetchAllMatches(),
    fetchLiveMatchIds(),
    fetchPromiedosGames().catch(() => NO_PROMIEDOS),
    fetchAngulismoData().catch(() => NO_ANGULISMO),
    getChannelCatalog().catch(() => [] as Channel[]),
  ]);

  // An empty feed is a failed fetch, not a quiet day: streamed.pk lists a few
  // hundred fixtures around the clock. A day with nothing *listable* is
  // plausible and cacheable; a day with nothing at all is not.
  if (rawMatches.length === 0) throw new EmptyUpstreamError();

  // Only with a working lookup and a channel catalog can we say a match has no
  // broadcaster. Without them we know nothing, which is a different thing.
  const broadcastsKnown = (promiedos.ok || angulismo.ok) && channels.length > 0;

  const matches = normalizeMatches(rawMatches, now)
    .filter(match => isListable(match, now))
    .map(match => ({ ...match, liveHint: liveIds.has(match.id) }));

  const { streamsByMatch, unresolvedMatches } = await resolveStreams(matches, deadline);
  const broadcastSources = buildBroadcastSources(matches, promiedos.games, angulismo.events, now);

  const catalog: CatalogMatch[] = [];

  matches.forEach((match, matchIndex) => {
    const streams = streamsByMatch.get(matchIndex) ?? [];
    const broadcasts = resolveFeedBroadcasts(findFeedFixtures(match, now, broadcastSources), channels);

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
      log.error('upstream unavailable and nothing cached to fall back on', error);
      return [];
    }
    log.warn('upstream unavailable, serving the last good catalog', error);
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
