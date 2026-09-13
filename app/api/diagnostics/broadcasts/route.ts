import { NextResponse } from 'next/server';
import { extractNextData, parsePromiedosPayload, fetchPromiedosGames } from '@/lib/promiedos';
import { getChannelCatalog, getStaticChannelCatalog } from '@/lib/channelCatalog';
import { fetchAngulismoData } from '@/lib/angulismo';
import { getCatalog } from '@/lib/catalog';
import { fetchAllMatches, fetchStreamLookup } from '@/lib/api';
import { normalizeMatches, matchStartMs } from '@/lib/matchUtils';
import { estimateFeedOffsetMs, findFixture } from '@/lib/teamMatch';
import { broadcastsFromEvent, mergeBroadcasts, resolveBroadcastChannels } from '@/lib/broadcasters';

/**
 * Reports whether the broadcast pipeline can reach its upstream from wherever
 * this is deployed, and — with `?q=` — traces one match through every stage.
 *
 * The stages are reported separately on purpose: a raw page probe only proves
 * the host is reachable, and says nothing about whether a fixture then matched
 * or which channels resolved from it.
 *
 * Everything here reads through the same caches the site uses, so the endpoint
 * stays cheap enough to leave unauthenticated.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROMIEDOS_BASE = 'https://www.promiedos.com.ar';
const PAGES = ['/ayer', '/', '/man'];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-AR,es;q=0.9',
};

async function probe(path: string) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${PROMIEDOS_BASE}${path}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const body = await response.text();
    const payload = extractNextData(body);
    const games = payload ? parsePromiedosPayload(payload) : [];

    return {
      path,
      ms: Date.now() - startedAt,
      status: response.status,
      bytes: body.length,
      nextDataFound: payload !== null,
      fixturesWithTv: games.length,
      bodyHead: body.slice(0, 160),
    };
  } catch (error) {
    return {
      path,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

const hit = (query: string, ...fields: Array<string | undefined>) =>
  fields.some(field => (field ?? '').toLowerCase().includes(query));

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase().trim();

  const [pages, channels, staticChannels, angulismo] = await Promise.all([
    Promise.all(PAGES.map(probe)),
    getChannelCatalog().catch(() => []),
    getStaticChannelCatalog().catch(() => []),
    fetchAngulismoData().catch(() => ({ events: [], channels: [], ok: false, stale: false })),
  ]);

  // The same call the catalog makes, rather than a hand-rolled fetch.
  const snapshot = await fetchPromiedosGames().catch(error => ({
    games: [],
    ok: false,
    stale: false,
    error: String(error),
  }));

  const base = {
    region: process.env.VERCEL_REGION ?? 'local',
    channelCatalog: {
      shipped: staticChannels.length,
      afterLiveRefresh: channels.length,
      refreshed: channels.length !== staticChannels.length || angulismo.ok,
    },
    pageProbes: pages,
    promiedos: {
      ok: snapshot.ok,
      stale: snapshot.stale,
      fixtures: snapshot.games.length,
      error: 'error' in snapshot ? snapshot.error : undefined,
    },
    angulismo: {
      ok: angulismo.ok,
      stale: angulismo.stale,
      events: angulismo.events.length,
      channels: angulismo.channels.length,
    },
  };

  if (!query) return NextResponse.json(base, { headers: { 'Cache-Control': 'no-store' } });

  const now = Date.now();

  const rawMatches = await fetchAllMatches();
  const normalized = normalizeMatches(rawMatches, now);
  // An empty feed here is what empties the site, so it is worth reporting on
  // its own rather than inferring it from a zero-length catalog.
  const upstreamFeed = { matches: rawMatches.length, listable: normalized.length };
  const rawHits = normalized.filter(m => hit(query, m.team1, m.team2));

  // Promiedos localises kickoff to the requesting IP, so the feeds' clocks are
  // aligned by measurement. A non-zero value here is the region showing itself.
  const datedMatches = normalized.flatMap(m => {
    const startMs = matchStartMs(m, now);
    return startMs === undefined ? [] : [{ team1: m.team1, team2: m.team2, startMs }];
  });
  const offsetMs = estimateFeedOffsetMs(datedMatches, snapshot.games);
  const angulismoOffsetMs = estimateFeedOffsetMs(datedMatches, angulismo.events) ?? 0;

  const traced = await Promise.all(
    rawHits.slice(0, 3).map(async match => {
      const lookups = await Promise.all(
        (match.sources ?? []).map(s => fetchStreamLookup(s.source, s.id)),
      );
      const streams = lookups.flatMap(l => l.streams);
      // A source whose lookup failed tells us nothing; one that succeeded with
      // no streams tells us the source is genuinely carrying nothing.
      const failedLookups = lookups.filter(l => !l.ok).length;
      const startMs = matchStartMs(match, now);
      const fixture = findFixture(match.team1, match.team2, startMs, snapshot.games, { offsetMs });
      const event = findFixture(
        match.team1, match.team2, startMs, angulismo.events, { offsetMs: angulismoOffsetMs },
      );

      const fromEvent = event ? broadcastsFromEvent(event, channels) : [];
      const fromPromiedos = fixture ? resolveBroadcastChannels(fixture, channels) : [];

      return {
        id: match.id,
        teams: `${match.team1} vs ${match.team2}`,
        startTime: match.startTime,
        sources: match.sources,
        resolvedStreams: streams.length,
        failedLookups,
        promiedosFixture: fixture
          ? { league: fixture.league, leagueId: fixture.leagueId, networks: fixture.networks }
          : null,
        angulismoEvent: event
          ? { competition: event.competition, channels: event.channels.map(c => `${c.name}(${c.options.length})`) }
          : null,
        resolvedBroadcasts: mergeBroadcasts(fromEvent, fromPromiedos)
          .map(b => `${b.channel}(${b.options.length})`),
      };
    }),
  );

  const catalog = await getCatalog();

  return NextResponse.json(
    {
      ...base,
      query,
      upstreamFeed,
      feedOffset: {
        promiedosMs: offsetMs,
        promiedosHours: offsetMs === null ? null : offsetMs / 3_600_000,
        angulismoHours: angulismoOffsetMs / 3_600_000,
      },
      promiedosFixturesMatching: snapshot.games
        .filter(g => hit(query, g.homeTeam, g.awayTeam))
        .map(g => ({ teams: `${g.homeTeam} vs ${g.awayTeam}`, start: g.startTimeMs, tv: g.networks })),
      rawFeed: traced,
      catalog: {
        size: catalog.length,
        matching: catalog
          .filter(m => hit(query, m.team1, m.team2))
          .map(m => ({
            id: m.id,
            streams: m.streams.length,
            broadcasts: m.broadcasts.map(b => b.channel),
          })),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
