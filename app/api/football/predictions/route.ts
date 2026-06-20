import { NextResponse } from 'next/server';
import { getPredictions } from '@/lib/apiFootball';
import { AF_REVALIDATE_STATIC } from '@/lib/constants';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fixtureId = Number(searchParams.get('fixture'));
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      return NextResponse.json({ error: 'fixture id is required' }, { status: 400 });
    }

    const predictions = await getPredictions(fixtureId);
    return NextResponse.json(predictions, {
      headers: {
        'Cache-Control': `s-maxage=${AF_REVALIDATE_STATIC}, stale-while-revalidate=86400`,
      },
    });
  } catch (err) {
    console.error('football/predictions route error:', err);
    return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 502 });
  }
}
