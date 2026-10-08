import { fetchLiveScoresCached } from '@/lib/flashscore';
import { jsonWithCache, withErrorResponse } from '@/lib/httpRoute';
import type { FlashscoreEntry } from '@/types/api';
import {
  SCORE_CACHE_MAX_AGE_MS,
  SCORE_DEDUP_WINDOW_MS,
  SCORES_CDN_MAX_AGE,
  SCORES_CDN_STALE_WHILE_REVALIDATE,
} from '@/lib/constants';

interface CacheEntry {
  data: FlashscoreEntry[];
  timestamp: number;
}

// Module-level cache: avoids hammering flashscore.mobi when multiple concurrent
// requests arrive during cold-start. Entries are pruned when they exceed
// SCORE_CACHE_MAX_AGE_MS to prevent unbounded memory growth.
const cache = new Map<string, CacheEntry>();

function pruneCache(now: number): void {
  const cutoff = now - SCORE_CACHE_MAX_AGE_MS;
  for (const [key, entry] of cache) {
    if (entry.timestamp < cutoff) cache.delete(key);
  }
}

export const GET = withErrorResponse<{ params: Promise<{ sport: string }> }>(
  'scores route',
  'Failed to fetch scores',
  async (_req, { params }) => {
    const { sport } = await params;
    const now = Date.now();

    pruneCache(now);

    const cached = cache.get(sport);
    const isFresh = cached !== undefined && now - cached.timestamp < SCORE_DEDUP_WINDOW_MS;

    const entries = isFresh ? cached.data : await fetchLiveScoresCached(sport);
    if (!isFresh) cache.set(sport, { data: entries, timestamp: now });

    return jsonWithCache(entries, SCORES_CDN_MAX_AGE, SCORES_CDN_STALE_WHILE_REVALIDATE);
  },
);
