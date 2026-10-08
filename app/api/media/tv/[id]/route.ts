import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { TMDB_BASE, toTvDetail, type TmdbTvResponse } from '@/lib/movieTmdb';

const log = createLogger('media/tv');

const TV_REVALIDATE_SECONDS = 3600; // season counts rarely change

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
      { next: { revalidate: TV_REVALIDATE_SECONDS } }
    );
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data: TmdbTvResponse = await res.json();
    return NextResponse.json(toTvDetail(tmdbId, data));
  } catch (err) {
    log.error('tv lookup failed', err);
    return NextResponse.json(null, { status: 200 });
  }
}
