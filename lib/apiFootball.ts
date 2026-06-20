import {
  API_FOOTBALL_BASE,
  WC_LEAGUE_ID,
  WC_SEASON,
  AF_REVALIDATE_STANDINGS,
  AF_REVALIDATE_FIXTURES,
  AF_REVALIDATE_TOPSCORERS,
  AF_REVALIDATE_LINEUPS,
  AF_REVALIDATE_LIVE,
  AF_REVALIDATE_STATIC,
  AF_DAILY_WARN_THRESHOLD,
} from './constants';
import type {
  ApiFootballEnvelope,
  ApiFootballStandingRow,
  ApiFootballFixture,
  ApiFootballTopScorer,
  ApiFootballLineup,
  ApiFootballEvent,
  ApiFootballStatistics,
  ApiFootballPrediction,
} from '@/types/api';

// Observability-only daily request counter. The Next.js Data Cache is the real
// guard against the 100/day free-plan cap; this just surfaces a warning in logs
// if a single runtime instance starts making more live calls than expected.
let requestCount = 0;
let countWindowStart = Date.now();

function trackRequest(path: string): void {
  const now = Date.now();
  if (now - countWindowStart > 86_400_000) {
    requestCount = 0;
    countWindowStart = now;
  }
  requestCount += 1;
  if (requestCount >= AF_DAILY_WARN_THRESHOLD) {
    console.warn(
      `[api-football] ${requestCount} live requests in the current 24h window (cap 100). Last: ${path}`,
    );
  }
}

/**
 * Core fetch wrapper. Adds the auth header and routes every call through the
 * Next.js Data Cache via `next.revalidate`, so a given path+query re-fetches at
 * most once per `revalidate` window regardless of visitor traffic.
 *
 * Returns the unwrapped `response` array, or [] on any error (the site degrades
 * gracefully — API-Football data is additive, never required for streaming).
 */
async function afFetch<T>(
  path: string,
  params: Record<string, string | number>,
  revalidate: number,
): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    console.warn('[api-football] API_FOOTBALL_KEY not set — skipping request');
    return [];
  }

  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${API_FOOTBALL_BASE}${path}?${query}`;

  try {
    trackRequest(path);
    const res = await fetch(url, {
      headers: { 'x-apisports-key': key },
      next: { revalidate },
    });
    if (!res.ok) {
      console.error(`[api-football] ${path} → HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as ApiFootballEnvelope<T>;
    if (json.errors && Object.keys(json.errors).length > 0) {
      console.error(`[api-football] ${path} → errors`, json.errors);
      return [];
    }
    return json.response ?? [];
  } catch (err) {
    console.error(`[api-football] ${path} fetch failed:`, err);
    return [];
  }
}

// ─── Shared / cron-warmed endpoints ──────────────────────────────────────────

/** World Cup 2026 standings. The `/standings` response nests league.standings. */
export async function getStandings(): Promise<ApiFootballStandingRow[][]> {
  const res = await afFetch<{ league: { standings: ApiFootballStandingRow[][] } }>(
    '/standings',
    { league: WC_LEAGUE_ID, season: WC_SEASON },
    AF_REVALIDATE_STANDINGS,
  );
  return res[0]?.league?.standings ?? [];
}

/** All World Cup 2026 fixtures (full schedule). */
export function getWcFixtures(): Promise<ApiFootballFixture[]> {
  return afFetch<ApiFootballFixture>(
    '/fixtures',
    { league: WC_LEAGUE_ID, season: WC_SEASON },
    AF_REVALIDATE_FIXTURES,
  );
}

/** Top scorers for the World Cup 2026. */
export function getTopScorers(): Promise<ApiFootballTopScorer[]> {
  return afFetch<ApiFootballTopScorer>(
    '/players/topscorers',
    { league: WC_LEAGUE_ID, season: WC_SEASON },
    AF_REVALIDATE_TOPSCORERS,
  );
}

// ─── Per-fixture (lazy) endpoints ────────────────────────────────────────────

export function getFixtureLineups(fixtureId: number): Promise<ApiFootballLineup[]> {
  return afFetch<ApiFootballLineup>(
    '/fixtures/lineups',
    { fixture: fixtureId },
    AF_REVALIDATE_LINEUPS,
  );
}

export function getFixtureEvents(fixtureId: number): Promise<ApiFootballEvent[]> {
  return afFetch<ApiFootballEvent>(
    '/fixtures/events',
    { fixture: fixtureId },
    AF_REVALIDATE_LIVE,
  );
}

export function getFixtureStatistics(fixtureId: number): Promise<ApiFootballStatistics[]> {
  return afFetch<ApiFootballStatistics>(
    '/fixtures/statistics',
    { fixture: fixtureId },
    AF_REVALIDATE_LIVE,
  );
}

export function getHeadToHead(homeId: number, awayId: number): Promise<ApiFootballFixture[]> {
  return afFetch<ApiFootballFixture>(
    '/fixtures/headtohead',
    { h2h: `${homeId}-${awayId}`, last: 10 },
    AF_REVALIDATE_STATIC,
  );
}

export function getPredictions(fixtureId: number): Promise<ApiFootballPrediction[]> {
  return afFetch<ApiFootballPrediction>(
    '/predictions',
    { fixture: fixtureId },
    AF_REVALIDATE_STATIC,
  );
}
