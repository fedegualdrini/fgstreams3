import { NextResponse } from 'next/server';
import { fetchLiveScores } from '@/lib/flashscore';
import type { FlashscoreEntry } from '@/types/api';
import { SCORE_DEDUP_WINDOW_MS, SCORE_CACHE_MAX_AGE_MS } from '@/lib/constants';

type CacheEntry = { data: FlashscoreEntry[]; timestamp: number };

// Module-level cache: avoids hammering flashscore.mobi when multiple concurrent
// requests arrive during cold-start. Entries are pruned when they exceed
// SCORE_CACHE_MAX_AGE_MS to prevent unbounded memory growth.
const cache = new Map<string, CacheEntry>();

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
    const now = Date.now();

    pruneCache();

    const cached = cache.get(sport);
    if (cached && now - cached.timestamp < SCORE_DEDUP_WINDOW_MS) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
      });
    }

    const entries = await fetchLiveScores(sport);
    cache.set(sport, { data: entries, timestamp: now });

    return NextResponse.json(entries, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('scores route error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch scores' },
      { status: 502 },
    );
  }
}
