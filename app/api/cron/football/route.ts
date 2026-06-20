import { NextResponse } from 'next/server';
import { getStandings, getWcFixtures, getTopScorers } from '@/lib/apiFootball';

// Warms the Next.js Data Cache for the cheap, shared World Cup endpoints so
// visitor traffic never triggers a live API-Football call for them. Invoked by
// the Vercel cron defined in vercel.json. Guarded by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const [standings, fixtures, scorers] = await Promise.all([
      getStandings(),
      getWcFixtures(),
      getTopScorers(),
    ]);

    return NextResponse.json({
      ok: true,
      warmed: {
        standingsGroups: standings.length,
        fixtures: fixtures.length,
        topScorers: scorers.length,
      },
    });
  } catch (err) {
    console.error('cron/football route error:', err);
    return NextResponse.json({ ok: false, error: 'Cron warm failed' }, { status: 502 });
  }
}
