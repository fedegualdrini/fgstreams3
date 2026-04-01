import { NextResponse } from 'next/server';
import { fetchMatchDetail } from '@/lib/flashscore';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ flashscoreId: string }> },
) {
  const { flashscoreId } = await params;
  const detail = await fetchMatchDetail(flashscoreId);

  // Use longer cache for finished matches
  const maxAge = detail?.status === 'fin' ? 3600 : 30;

  return NextResponse.json(detail, {
    headers: { 'Cache-Control': `s-maxage=${maxAge}, stale-while-revalidate=60` },
  });
}
