import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MediaResult } from '@/types/movies';

const TMDB_BASE = 'https://api.themoviedb.org/3';

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

  const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
  const url = `${TMDB_BASE}/${endpoint}?api_key=${key}&query=${encodeURIComponent(q)}&language=en-US&page=1&include_adult=false`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 300 }, // cache search results 5 min
    });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();

    const results: MediaResult[] = (data.results ?? [])
      .slice(0, 12)
      .map((item: Record<string, unknown>) => ({
        tmdbId: item.id as number,
        type,
        title: (type === 'movie' ? item.title : item.name) as string,
        year: ((type === 'movie' ? item.release_date : item.first_air_date) as string ?? '').slice(0, 4),
        overview: (item.overview as string) ?? '',
        posterPath: (item.poster_path as string | null) ?? null,
        voteAverage: (item.vote_average as number) ?? 0,
      }));

    return NextResponse.json(results);
  } catch (err) {
    console.error('[media/search]', err);
    return NextResponse.json([], { status: 200 }); // fail-open with empty list
  }
}
