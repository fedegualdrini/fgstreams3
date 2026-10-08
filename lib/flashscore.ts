import { unstable_cache } from 'next/cache';
import type { FlashscoreDetail, FlashscoreEntry } from '@/types/api';
import { REVALIDATE_FLASHSCORE_SCORES } from './constants';
import { fetchText } from './httpClient';
import { createLogger } from './logger';
import { parseMatchDetail, parseMatchLineups, parseMatchStats, parseScoreData } from './flashscoreParse';
import { getFlashscoreUrl } from './sportMap';

/**
 * flashscore.mobi client: fetches pages and hands the HTML to the pure parsers
 * in lib/flashscoreParse.ts. Scores are only worth anything fresh, so nothing
 * here is cached by the fetch layer (`revalidate: 0`); the API routes and
 * `fetchLiveScoresCached` decide how long a result may be reused.
 */

const log = createLogger('flashscore');

const DETAIL_BASE_URL = 'https://www.flashscore.mobi/match';

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/** HTML of a flashscore.mobi page, or null if the request failed. */
function fetchPage(url: string, label: string): Promise<string | null> {
  return fetchText(url, { log, label, revalidate: 0, headers: REQUEST_HEADERS });
}

/** Live scores for one sport, parsed from the page's #score-data block. */
export async function fetchLiveScores(sport: string): Promise<FlashscoreEntry[]> {
  const url = getFlashscoreUrl(sport);
  if (!url) return [];

  const html = await fetchPage(url, `live scores (${sport})`);
  return html === null ? [] : parseScoreData(html);
}

/**
 * Score, period breakdown and incidents for one match, plus the stats and
 * lineups tabs. The extra tabs are best-effort: a failed one leaves its
 * section empty rather than failing the whole detail.
 */
export async function fetchMatchDetail(flashscoreId: string): Promise<FlashscoreDetail | null> {
  const base = `${DETAIL_BASE_URL}/${flashscoreId}/`;
  const fetchTab = (tab?: 'stats' | 'lineups') =>
    fetchPage(tab ? `${base}?t=${tab}` : base, `match ${flashscoreId}${tab ? ` ${tab}` : ''}`);

  const [detailHtml, statsHtml, lineupsHtml] = await Promise.all([
    fetchTab(),
    fetchTab('stats'),
    fetchTab('lineups'),
  ]);
  if (!detailHtml) return null;

  const detail = parseMatchDetail(detailHtml, flashscoreId);
  if (!detail) return null;

  detail.stats = statsHtml ? parseMatchStats(statsHtml) : [];
  detail.lineups = lineupsHtml ? parseMatchLineups(lineupsHtml) : null;
  return detail;
}

/** Live scores shared across serverless instances through the Next.js Data Cache. */
export const fetchLiveScoresCached = unstable_cache(
  fetchLiveScores,
  ['flashscore-live-scores'],
  { revalidate: REVALIDATE_FLASHSCORE_SCORES },
);
