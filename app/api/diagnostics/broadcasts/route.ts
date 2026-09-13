import { NextResponse } from 'next/server';
import { extractNextData, parsePromiedosPayload, fetchPromiedosGames } from '@/lib/promiedos';
import { getChannelCatalog } from '@/lib/channelCatalog';
import { getCatalog, buildCatalogUncached } from '@/lib/catalog';
import { fetchAllMatches, fetchStreams } from '@/lib/api';
import { normalizeMatches, matchStartMs } from '@/lib/matchUtils';
import { findPromiedosGame } from '@/lib/teamMatch';
import { resolveBroadcastChannels } from '@/lib/broadcasters';

/**
 * Reports whether the broadcast pipeline can reach its upstream from wherever
 * this is deployed, and — with `?q=` — traces one match through every stage.
 *
 * The stages are reported separately on purpose. A raw page probe only proves
 * the host is reachable; it says nothing about the same fetch running inside
 * `unstable_cache`, and a fresh build compared against the cached one separates
 * a resolution failure from a stale-cache failure.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  const rawHits = normalizeMatches(rawMatches, now).filter(m => hit(query, m.team1, m.team2));

  const traced = await Promise.all(
    rawHits.slice(0, 3).map(async match => {
      const streams = (
        await Promise.all((match.sources ?? []).map(s => fetchStreams(s.source, s.id)))
      ).flat();
      const fixture = findPromiedosGame(
        match.team1, match.team2, matchStartMs(match, now), snapshot.games,
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

  const [cached, fresh] = await Promise.all([getCatalog(), buildCatalogUncached()]);
  const summarize = (list: Awaited<ReturnType<typeof getCatalog>>) => ({
    size: list.length,
    matching: list
      .filter(m => hit(query, m.team1, m.team2))
      .map(m => ({ id: m.id, streams: m.streams.length, broadcasts: m.broadcasts.map(b => b.channel) })),
  });

  return NextResponse.json(
    {
      ...base,
      query,
      promiedosFixturesMatching: snapshot.games
        .filter(g => hit(query, g.homeTeam, g.awayTeam))
        .map(g => ({ teams: `${g.homeTeam} vs ${g.awayTeam}`, start: g.startTimeMs, tv: g.networks })),
      rawFeed: traced,
      cachedCatalog: summarize(cached),
      freshCatalog: summarize(fresh),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
