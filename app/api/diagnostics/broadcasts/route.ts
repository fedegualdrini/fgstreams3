import { NextResponse } from 'next/server';
import { extractNextData, parsePromiedosPayload } from '@/lib/promiedos';
import { getChannelCatalog } from '@/lib/channelCatalog';

/**
 * Reports whether the broadcast pipeline can reach its upstream from wherever
 * this is deployed.
 *
 * The Promiedos lookup works from a residential connection but not from every
 * host, and a failure is invisible in the UI — it just means fewer matches show
 * a channel. This endpoint makes the failure mode legible: per page, what came
 * back and how far parsing got.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROMIEDOS_BASE = 'https://www.promiedos.com.ar';
const PAGES = ['/ayer', '/', '/man'];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-AR,es;q=0.9',
};

async function probe(path: string) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${PROMIEDOS_BASE}${path}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const body = await response.text();
    const payload = extractNextData(body);
    const games = payload ? parsePromiedosPayload(payload) : [];

    return {
      path,
      ms: Date.now() - startedAt,
      status: response.status,
      bytes: body.length,
      server: response.headers.get('server'),
      cfRay: response.headers.get('cf-ray'),
      contentType: response.headers.get('content-type'),
      nextDataFound: payload !== null,
      fixturesWithTv: games.length,
      // The first 300 characters say whether this is the site, a challenge
      // page, or a block notice.
      bodyHead: body.slice(0, 300),
    };
  } catch (error) {
    return {
      path,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

export async function GET() {
  const [pages, channels] = await Promise.all([
    Promise.all(PAGES.map(probe)),
    getChannelCatalog().then(c => c.length).catch(e => `failed: ${String(e)}`),
  ]);

  return NextResponse.json(
    {
      region: process.env.VERCEL_REGION ?? 'local',
      channelCatalogSize: channels,
      pages,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
