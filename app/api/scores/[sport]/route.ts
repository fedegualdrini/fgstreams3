import { NextResponse } from 'next/server';
import { fetchLiveScores } from '@/lib/flashscore';

// Module-level dedup: track last fetch time per sport to avoid hammering
// flashscore.mobi when multiple concurrent requests arrive during cold start.
const lastFetchTime: Record<string, number> = {};
const DEDUP_MS = 25_000; // don't refetch within 25s

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sport: string }> },
) {
  const { sport } = await params;

  const now = Date.now();
  const last = lastFetchTime[sport] ?? 0;
  if (now - last < DEDUP_MS && cachedResults[sport]) {
    return NextResponse.json(cachedResults[sport], {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    });
  }

  const entries = await fetchLiveScores(sport);
  lastFetchTime[sport] = now;
  cachedResults[sport] = entries;

  return NextResponse.json(entries, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
  });
}

const cachedResults: Record<string, unknown[]> = {};
