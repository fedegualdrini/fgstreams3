import { NextResponse } from 'next/server';
import { Impit } from 'impit';
import { STREAM_TEST_TIMEOUT_MS } from '@/lib/constants';
import { withErrorResponse } from '@/lib/httpRoute';
import { createLogger } from '@/lib/logger';
import { encodeStreamTestRequest, STREAM_TEST_FETCH_URL } from '@/lib/streamTest';
import { decodeStreamTestResponse, resolveStreamTestVariant, rewriteStreamTestManifest } from '@/lib/streamTestServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const log = createLogger('stream-test manifest');
const headers = { 'Cache-Control': 'no-store' };
// The CDN accepts browser-compatible TLS; Node's built-in fetch receives 403.
const client = new Impit({ browser: 'chrome', timeout: STREAM_TEST_TIMEOUT_MS });

export const GET = withErrorResponse('stream-test manifest', 'Unable to load stream manifest.', async request => {
  const params = new URL(request.url).searchParams;
  const embedUrl = params.get('embed') ?? '';
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = encodeStreamTestRequest(embedUrl);
  } catch {
    return NextResponse.json({ error: 'Unsupported embed URL.' }, { status: 400, headers });
  }
  // Resolve and read in this invocation: browser-issued tokens fail from Vercel.
  const resolved = await client.fetch(STREAM_TEST_FETCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', Referer: 'https://embed.st/', Origin: 'https://embed.st' },
    body,
    redirect: 'error',
    signal: request.signal,
  });
  if (!resolved.ok) {
    log.warn(`stream resolver responded ${resolved.status}`);
    return NextResponse.json({ error: 'The provider could not resolve this stream.' }, { status: 502, headers });
  }
  let rootUrl: string;
  try {
    rootUrl = decodeStreamTestResponse(await resolved.bytes(), resolved.headers.get('goat'));
  } catch {
    return NextResponse.json({ error: 'The provider response could not be authenticated or decoded.' }, { status: 502, headers });
  }
  let url: string;
  try {
    url = resolveStreamTestVariant(rootUrl, params.get('variant'));
  } catch {
    return NextResponse.json({ error: 'Unsupported stream variant.' }, { status: 400, headers });
  }
  const upstream = await client.fetch(url, {
    headers: { Referer: 'https://embed.st/', Origin: 'https://embed.st' },
    redirect: 'error',
    signal: request.signal,
  });
  if (!upstream.ok) {
    log.warn(`stream manifest responded ${upstream.status}`);
    return NextResponse.json({ error: 'The provider rejected or could not serve this stream.' }, { status: 502, headers });
  }
  try {
    return new NextResponse(rewriteStreamTestManifest(await upstream.text(), url, rootUrl, embedUrl), {
      headers: { ...headers, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  } catch {
    return NextResponse.json({ error: 'The provider returned an unsupported manifest.' }, { status: 502, headers });
  }
});
