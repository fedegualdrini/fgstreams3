import type { PromiedosGame } from '@/types/api';
import { PROMIEDOS_TIMEOUT_MS, REVALIDATE_BROADCASTS } from './constants';

/**
 * promiedos.com.ar publishes, per fixture, the TV networks carrying it — the
 * channel icons shown next to each game. There is no public JSON API for it
 * (api.promiedos.com.ar only answers image and stub routes), but the site is a
 * Next.js Pages Router app, so the same data is embedded verbatim in the
 * __NEXT_DATA__ script of every page. We parse that instead of scraping markup.
 */

const PROMIEDOS_BASE = 'https://www.promiedos.com.ar';

// Yesterday / today / tomorrow. Streamed lists fixtures a day or two out and
// timezone skew can push an Argentine evening game onto the next UTC day.
const PROMIEDOS_PAGES = ['/ayer', '/', '/man'];

const BROWSER_HEADERS = {
  // The site returns a bot interstitial without a browser-shaped UA.
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const NEXT_DATA_RE =
  /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/;

interface RawPromiedosTeam { name?: string; short_name?: string }
interface RawPromiedosGame {
  id?: string;
  teams?: RawPromiedosTeam[];
  start_time?: string;
  tv_networks?: Array<{ id?: string; name?: string }>;
}
interface RawPromiedosLeague {
  id?: string;
  name?: string;
  country_id?: string;
  games?: RawPromiedosGame[];
}

/**
 * Promiedos writes kickoff as "DD-MM-YYYY HH:mm" in Argentina local time, which
 * has no DST — a fixed UTC-3 — so the offset can be applied directly.
 */
const ARGENTINA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export function parsePromiedosStartTime(value: string | undefined): number {
  if (!value) return NaN;
  const m = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const [, day, month, year, hour, minute] = m;
  return (
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) +
    ARGENTINA_UTC_OFFSET_MS
  );
}

export function extractNextData(html: string): unknown | null {
  const match = html.match(NEXT_DATA_RE);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Pull the fixture list out of a parsed __NEXT_DATA__ payload. */
export function parsePromiedosPayload(payload: unknown): PromiedosGame[] {
  const leagues = (payload as { props?: { pageProps?: { data?: { leagues?: unknown } } } })
    ?.props?.pageProps?.data?.leagues;
  if (!Array.isArray(leagues)) return [];

  const games: PromiedosGame[] = [];

  for (const rawLeague of leagues as RawPromiedosLeague[]) {
    for (const rawGame of rawLeague.games ?? []) {
      const networks = (rawGame.tv_networks ?? [])
        .map((network) => network?.name?.trim())
        .filter((name): name is string => Boolean(name));
      if (networks.length === 0) continue;

      const home = rawGame.teams?.[0]?.name?.trim();
      const away = rawGame.teams?.[1]?.name?.trim();
      if (!home || !away) continue;

      const startTimeMs = parsePromiedosStartTime(rawGame.start_time);
      if (!Number.isFinite(startTimeMs)) continue;

      games.push({
        id: rawGame.id ?? `${home}-${away}-${startTimeMs}`,
        league: rawLeague.name ?? '',
        leagueId: rawLeague.id ?? '',
        countryId: rawLeague.country_id ?? '',
        homeTeam: home,
        awayTeam: away,
        startTimeMs,
        networks,
      });
    }
  }

  return games;
}

/** null distinguishes "the page failed" from "the page listed no fixtures". */
async function fetchPage(path: string): Promise<PromiedosGame[] | null> {
  try {
    const response = await fetch(`${PROMIEDOS_BASE}${path}`, {
      headers: BROWSER_HEADERS,
      // Without a deadline a hung request would stall the whole catalog build,
      // which runs inside a request.
      signal: AbortSignal.timeout(PROMIEDOS_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_BROADCASTS },
    });
    if (!response.ok) {
      console.warn(`promiedos: ${path} responded ${response.status}`);
      return null;
    }
    const payload = extractNextData(await response.text());
    if (!payload) {
      console.warn(`promiedos: no __NEXT_DATA__ payload on ${path}`);
      return null;
    }
    return parsePromiedosPayload(payload);
  } catch (error) {
    console.error(`promiedos: failed to load ${path}:`, error);
    return null;
  }
}

export interface PromiedosSnapshot {
  games: PromiedosGame[];
  /**
   * Whether this snapshot reflects a successful lookup. When false the caller
   * knows nothing about broadcasters — which is not the same as knowing a match
   * has none, and callers must not treat it as such.
   */
  ok: boolean;
  /** True when `games` came from the last good lookup rather than this one. */
  stale: boolean;
}

// Last successful lookup, reused when a refresh fails. Warm instances keep this
// across requests, so one bad response cannot blank the broadcast map.
let lastGood: PromiedosGame[] | null = null;

/**
 * Every fixture Promiedos knows about for yesterday, today and tomorrow that
 * has at least one TV network attached.
 */
export async function fetchPromiedosGames(): Promise<PromiedosSnapshot> {
  const pages = await Promise.all(PROMIEDOS_PAGES.map(fetchPage));
  const succeeded = pages.filter((page): page is PromiedosGame[] => page !== null);

  if (succeeded.length === 0) {
    if (lastGood) {
      console.warn('promiedos: all pages failed, reusing the last good snapshot');
      return { games: lastGood, ok: true, stale: true };
    }
    return { games: [], ok: false, stale: false };
  }

  const byId = new Map<string, PromiedosGame>();
  for (const game of succeeded.flat()) {
    if (!byId.has(game.id)) byId.set(game.id, game);
  }

  const games = [...byId.values()];
  lastGood = games;
  return { games, ok: true, stale: false };
}
