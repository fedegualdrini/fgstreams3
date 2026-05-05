import { NextResponse } from 'next/server';
import type { TvDetail, TvSeason } from '@/types/movies';

const TMDB_BASE = 'https://api.themoviedb.org/3';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json(null, { status: 500 });

  const tmdbId = parseInt(params.id, 10);
  if (isNaN(tmdbId)) return NextResponse.json(null, { status: 400 });

  try {
    const res = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}?api_key=${key}&language=en-US`,
      { next: { revalidate: 3600 } } // season counts rarely change
    );
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();

    const seasons: TvSeason[] = (data.seasons ?? [])
      .filter((s: Record<string, unknown>) => (s.season_number as number) > 0)
      .map((s: Record<string, unknown>) => ({
        seasonNumber: s.season_number as number,
        name: (s.name as string) ?? `Season ${s.season_number}`,
        episodeCount: (s.episode_count as number) ?? 0,
      }));

    const detail: TvDetail = {
      tmdbId,
      title: data.name ?? '',
      seasons,
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error('[media/tv]', err);
    return NextResponse.json(null, { status: 200 });
  }
}
