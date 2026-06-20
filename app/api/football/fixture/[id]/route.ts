import { NextResponse } from 'next/server';
import { getFixtureLineups, getFixtureEvents, getFixtureStatistics } from '@/lib/apiFootball';
import { AF_REVALIDATE_LIVE } from '@/lib/constants';
import type { ApiFootballFixtureDetail } from '@/types/api';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const fixtureId = Number(id);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      return NextResponse.json({ error: 'Invalid fixture id' }, { status: 400 });
    }

    const [lineups, events, statistics] = await Promise.all([
      getFixtureLineups(fixtureId),
      getFixtureEvents(fixtureId),
      getFixtureStatistics(fixtureId),
    ]);

    const detail: ApiFootballFixtureDetail = { fixtureId, lineups, events, statistics };
    return NextResponse.json(detail, {
      headers: {
        'Cache-Control': `s-maxage=${AF_REVALIDATE_LIVE}, stale-while-revalidate=3600`,
      },
    });
  } catch (err) {
    console.error('football/fixture route error:', err);
    return NextResponse.json({ error: 'Failed to fetch fixture detail' }, { status: 502 });
  }
}
