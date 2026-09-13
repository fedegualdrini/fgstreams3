import { NextResponse } from 'next/server';
import { extractNextData, parsePromiedosPayload, fetchPromiedosGames } from '@/lib/promiedos';
import { getChannelCatalog } from '@/lib/channelCatalog';
import { getCatalog } from '@/lib/catalog';
import { fetchAllMatches, fetchStreams } from '@/lib/api';
import { normalizeMatches, matchStartMs } from '@/lib/matchUtils';
import { estimateFeedOffsetMs, findPromiedosGame } from '@/lib/teamMatch';
import { resolveBroadcastChannels } from '@/lib/broadcasters';

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

  const [pages, channels] = await Promise.all([
    Promise.all(PAGES.map(probe)),
    getChannelCatalog().then(c => c).catch(() => []),
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
    channelCatalogSize: channels.length,
    pageProbes: pages,
    pipelineLookup: {
      ok: snapshot.ok,
      stale: snapshot.stale,
      fixtures: snapshot.games.length,
      error: 'error' in snapshot ? snapshot.error : undefined,
    },
  };

  if (!query) return NextResponse.json(base, { headers: { 'Cache-Control': 'no-store' } });

  const now = Date.now();

  const rawMatches = await fetchAllMatches();
  const normalized = normalizeMatches(rawMatches, now);
  const rawHits = normalized.filter(m => hit(query, m.team1, m.team2));

  // Promiedos localises kickoff to the requesting IP, so the feeds' clocks are
  // aligned by measurement. A non-zero value here is the region showing itself.
  const offsetMs = estimateFeedOffsetMs(
    normalized.flatMap(m => {
      const startMs = matchStartMs(m, now);
      return startMs === undefined ? [] : [{ team1: m.team1, team2: m.team2, startMs }];
    }),
    snapshot.games,
  );

  const traced = await Promise.all(
    rawHits.slice(0, 3).map(async match => {
      const streams = (
        await Promise.all((match.sources ?? []).map(s => fetchStreams(s.source, s.id)))
      ).flat();
      const fixture = findPromiedosGame(
        match.team1, match.team2, matchStartMs(match, now), snapshot.games, { offsetMs },
      );
      return {
        id: match.id,
        teams: `${match.team1} vs ${match.team2}`,
        startTime: match.startTime,
        sources: match.sources,
        resolvedStreams: streams.length,
        promiedosFixture: fixture
          ? { league: fixture.league, leagueId: fixture.leagueId, networks: fixture.networks }
          : null,
        resolvedBroadcasts: fixture
          ? resolveBroadcastChannels(fixture, channels).map(b => b.channel)
          : [],
      };
    }),
  );

  const catalog = await getCatalog();

  return NextResponse.json(
    {
      ...base,
      query,
      feedOffset: {
        ms: offsetMs,
        hours: offsetMs === null ? null : offsetMs / 3_600_000,
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
