import { fetchStreams } from '@/lib/api';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ source: string; id: string }> }
) {
  try {
    const { source, id } = await params;
    const streams = await fetchStreams(source, id);
    return NextResponse.json(streams, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('streams route error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch streams' },
      { status: 502 },
    );
  }
}
