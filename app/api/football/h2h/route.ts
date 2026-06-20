import { NextResponse } from 'next/server';
import { getHeadToHead } from '@/lib/apiFootball';
import { AF_REVALIDATE_STATIC } from '@/lib/constants';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const home = Number(searchParams.get('home'));
    const away = Number(searchParams.get('away'));
    if (!Number.isInteger(home) || !Number.isInteger(away) || home <= 0 || away <= 0) {
      return NextResponse.json({ error: 'home and away team ids are required' }, { status: 400 });
    }

    const fixtures = await getHeadToHead(home, away);
    return NextResponse.json(fixtures, {
      headers: {
        'Cache-Control': `s-maxage=${AF_REVALIDATE_STATIC}, stale-while-revalidate=86400`,
      },
    });
  } catch (err) {
    console.error('football/h2h route error:', err);
    return NextResponse.json({ error: 'Failed to fetch head-to-head' }, { status: 502 });
  }
}
