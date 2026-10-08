import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { TMDB_BASE, toMediaResults, type TmdbSearchResponse } from '@/lib/movieTmdb';

const log = createLogger('media/search');

const SEARCH_REVALIDATE_SECONDS = 300;

const SearchParamsSchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(['movie', 'tv']).default('movie'),
});

export async function GET(req: NextRequest) {
  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  const { q, type } = parsed.data;
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'TMDB key not configured' }, { status: 500 });
  }

  const url = `${TMDB_BASE}/search/${type}?api_key=${key}&query=${encodeURIComponent(q)}&language=en-US&page=1&include_adult=false`;

  try {
    const res = await fetch(url, { next: { revalidate: SEARCH_REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data: TmdbSearchResponse = await res.json();
    return NextResponse.json(toMediaResults(data, type));
  } catch (err) {
    log.error('search failed', err);
    return NextResponse.json([], { status: 200 }); // fail-open with empty list
  }
}
