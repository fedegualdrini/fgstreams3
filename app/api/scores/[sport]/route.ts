import { NextResponse } from 'next/server';
import { fetchLiveScores } from '@/lib/flashscore';
import { SPORT_TO_FLASHSCORE_SLUG } from '@/lib/sportMap';
import type { FlashscoreEntry } from '@/types/api';
import { SCORE_DEDUP_WINDOW_MS, SCORE_CACHE_MAX_AGE_MS } from '@/lib/constants';

type CacheEntry = { data: FlashscoreEntry[]; timestamp: number };

// Module-level cache: avoids hammering flashscore.mobi when multiple concurrent
// requests arrive during cold-start. Entries are pruned when they exceed
// SCORE_CACHE_MAX_AGE_MS to prevent unbounded memory growth.
const cache = new Map<string, CacheEntry>();

// Deduplicates concurrent fetches for the same sport so only one upstream
// request is in flight at a time, regardless of how many callers arrive
// before the first resolves.
const inflightMap = new Map<string, Promise<FlashscoreEntry[]>>();

const cacheHeaders = { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' };

function pruneCache(): void {
  const cutoff = Date.now() - SCORE_CACHE_MAX_AGE_MS;
  for (const [key, entry] of cache) {
    if (entry.timestamp < cutoff) cache.delete(key);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sport: string }> },
) {
  try {
    const { sport } = await params;

    if (!(sport in SPORT_TO_FLASHSCORE_SLUG)) {
      return NextResponse.json({ error: 'Unknown sport' }, { status: 400 });
    }

    const now = Date.now();
    pruneCache();

    const cached = cache.get(sport);
    if (cached && now - cached.timestamp < SCORE_DEDUP_WINDOW_MS) {
      return NextResponse.json(cached.data, { headers: cacheHeaders });
    }

    let inflight = inflightMap.get(sport);
    if (!inflight) {
      inflight = fetchLiveScores(sport)
        .then(data => {
          cache.set(sport, { data, timestamp: Date.now() });
          inflightMap.delete(sport);
          return data;
        })
        .catch(err => {
          inflightMap.delete(sport);
          throw err;
        });
      inflightMap.set(sport, inflight);
    }

    const entries = await inflight;
    return NextResponse.json(entries, { headers: cacheHeaders });
  } catch (err) {
    console.error('scores route error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch scores' },
      { status: 502 },
    );
  }
}
