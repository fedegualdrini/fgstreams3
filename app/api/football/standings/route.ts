import { NextResponse } from 'next/server';
import { getStandings } from '@/lib/apiFootball';
import { AF_REVALIDATE_STANDINGS } from '@/lib/constants';

export async function GET() {
  try {
    const standings = await getStandings();
    return NextResponse.json(standings, {
      headers: {
        'Cache-Control': `s-maxage=${AF_REVALIDATE_STANDINGS}, stale-while-revalidate=86400`,
      },
    });
  } catch (err) {
    console.error('football/standings route error:', err);
    return NextResponse.json({ error: 'Failed to fetch standings' }, { status: 502 });
  }
}
