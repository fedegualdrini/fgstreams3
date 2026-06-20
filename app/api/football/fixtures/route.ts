import { NextResponse } from 'next/server';
import { getWcFixtures } from '@/lib/apiFootball';
import { AF_REVALIDATE_FIXTURES } from '@/lib/constants';

export async function GET() {
  try {
    const fixtures = await getWcFixtures();
    return NextResponse.json(fixtures, {
      headers: {
        'Cache-Control': `s-maxage=${AF_REVALIDATE_FIXTURES}, stale-while-revalidate=86400`,
      },
    });
  } catch (err) {
    console.error('football/fixtures route error:', err);
    return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 502 });
  }
}
