import { NextResponse } from 'next/server';
import { getTopScorers } from '@/lib/apiFootball';
import { AF_REVALIDATE_TOPSCORERS } from '@/lib/constants';

export async function GET() {
  try {
    const scorers = await getTopScorers();
    return NextResponse.json(scorers, {
      headers: {
        'Cache-Control': `s-maxage=${AF_REVALIDATE_TOPSCORERS}, stale-while-revalidate=86400`,
      },
    });
  } catch (err) {
    console.error('football/topscorers route error:', err);
    return NextResponse.json({ error: 'Failed to fetch top scorers' }, { status: 502 });
  }
}
