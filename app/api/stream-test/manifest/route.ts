import { NextResponse } from 'next/server';
import { Impit } from 'impit';
import { STREAM_TEST_TIMEOUT_MS } from '@/lib/constants';
import { withErrorResponse } from '@/lib/httpRoute';
import { createLogger } from '@/lib/logger';
import { parseStreamTestManifestUrl, rewriteStreamTestManifest } from '@/lib/streamTestServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const log = createLogger('stream-test manifest');
const headers = { 'Cache-Control': 'no-store' };
// The CDN accepts browser-compatible TLS; Node's built-in fetch receives 403.
const client = new Impit({ browser: 'chrome', timeout: STREAM_TEST_TIMEOUT_MS });

export const GET = withErrorResponse('stream-test manifest', 'Unable to load stream manifest.', async request => {
  let url: URL;
  try {
    url = parseStreamTestManifestUrl(new URL(request.url).searchParams.get('url') ?? '');
  } catch {
    return NextResponse.json({ error: 'Unsupported stream manifest URL.' }, { status: 400, headers });
  }
  const upstream = await client.fetch(url.href, {
    headers: { Referer: 'https://embed.st/', Origin: 'https://embed.st' },
    redirect: 'error',
  });
  if (!upstream.ok) {
    log.warn(`stream manifest responded ${upstream.status}`);
    return NextResponse.json({ error: 'The provider rejected or could not serve this stream.' }, { status: 502, headers });
  }
  try {
    return new NextResponse(rewriteStreamTestManifest(await upstream.text(), url.href), {
      headers: { ...headers, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  } catch {
    return NextResponse.json({ error: 'The provider returned an unsupported manifest.' }, { status: 502, headers });
  }
});
