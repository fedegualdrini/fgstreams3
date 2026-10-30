import { unstable_cache } from 'next/cache';
import type { AngulismoSnapshot, CatalogMatch } from '@/types/api';
import type { Channel } from '@/types/channels';
import { fetchAllMatches } from './api';
import { normalizeMatches } from './matchUtils';
import { fetchPromiedosGames, type PromiedosSnapshot } from './promiedos';
import { fetchAngulismoData } from './angulismo';
import { getChannelCatalog } from './channelCatalog';
import { buildBroadcastSources, findFeedFixtures, resolveFeedBroadcasts } from './catalogBroadcasts';
import { currentLiveState, isListable } from './catalogWindow';
import { REVALIDATE_CATALOG } from './constants';
import { createLogger } from './logger';

/**
 * The match catalog: every listable match together with the streams that
 * actually play it.
 *
 * StreamFree includes source URLs and live flags in its stream listing. Keep
 * those variants alongside optional TV broadcasts so the match page can render
 * immediately, without issuing another lookup for every match.
 *
 * catalogWindow owns listing rules; catalogBroadcasts matches TV fixtures.
 */

const log = createLogger('catalog');

export type { CatalogMatch };

/** Failed fetches must not replace a healthy cached catalog with an empty one. */
class UpstreamError extends Error {
  constructor() {
    super('upstream stream feed unavailable');
    this.name = 'UpstreamError';
  }
}

// Broadcast data is a bonus; neither source is allowed to fail the catalog.
const NO_PROMIEDOS: PromiedosSnapshot = { games: [], ok: false, stale: false };
const NO_ANGULISMO: AngulismoSnapshot = { events: [], channels: [], ok: false, stale: false };

async function buildCatalog(): Promise<CatalogMatch[]> {
  const now = Date.now();
  const angulismoRequest = fetchAngulismoData().catch(() => NO_ANGULISMO);

  const [rawMatches, promiedos, angulismo, channels] = await Promise.all([
    fetchAllMatches(),
    fetchPromiedosGames().catch(() => NO_PROMIEDOS),
    angulismoRequest,
    angulismoRequest.then(snapshot => getChannelCatalog(snapshot)).catch(() => [] as Channel[]),
  ]);

  // A successful empty response is a quiet feed; null means the fetch failed.
  if (rawMatches === null) throw new UpstreamError();

  // Only with a working lookup and a channel catalog can we say a match has no
  // broadcaster. Without them we know nothing, which is a different thing.
  const broadcastsKnown = (promiedos.ok || angulismo.ok) && channels.length > 0;

  const matches = normalizeMatches(rawMatches)
    .filter(match => isListable(match, now));

  const broadcastSources = buildBroadcastSources(matches, promiedos.games, angulismo.events, now);

  const catalog: CatalogMatch[] = [];

  matches.forEach(match => {
    const streams = match.sources.flatMap(source => source.streams ?? []);
    const broadcasts = resolveFeedBroadcasts(findFeedFixtures(match, now, broadcastSources), channels);

    // Without broadcast data, a missing TV option is unknown rather than absent.
    const playable = streams.length > 0 || broadcasts.length > 0;
    if (!playable && broadcastsKnown) return;

    catalog.push({ ...match, streams, broadcasts, isLive: currentLiveState(match) });
  });

  return catalog;
}

const getCachedCatalog = unstable_cache(buildCatalog, ['strmfree-match-catalog'], {
  revalidate: REVALIDATE_CATALOG,
  tags: ['match-catalog'],
});

// Last catalog that built successfully. A warm instance can serve this while
// the upstream is down instead of showing an empty site.
let lastGoodCatalog: CatalogMatch[] | null = null;

/**
 * The current provider catalog. Live status comes from the cached source list;
 * only listing windows are recomputed against the current clock.
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
    .map(match => ({ ...match, isLive: currentLiveState(match) }));
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
