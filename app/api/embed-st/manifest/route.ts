import { NextResponse } from 'next/server';
import { Impit } from 'impit';
import { EMBED_ST_TIMEOUT_MS } from '@/lib/constants';
import { withErrorResponse } from '@/lib/httpRoute';
import { createLogger } from '@/lib/logger';
import { encodeEmbedStRequest, EMBED_ST_FETCH_URL } from '@/lib/embedSt';
import { decodeEmbedStResponse, resolveEmbedStVariant, rewriteEmbedStManifest } from '@/lib/embedStServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const log = createLogger('embed-st manifest');
const headers = { 'Cache-Control': 'no-store' };
const providerHeaders = { Referer: 'https://embed.st/', Origin: 'https://embed.st' };
// The CDN accepts browser-compatible TLS; Node's built-in fetch receives 403.
const client = new Impit({ browser: 'chrome', timeout: EMBED_ST_TIMEOUT_MS });

export const GET = withErrorResponse('embed-st manifest', 'Unable to load stream manifest.', async request => {
  const params = new URL(request.url).searchParams;
  const embedUrl = params.get('embed') ?? '';
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = encodeEmbedStRequest(embedUrl);
  } catch {
    return NextResponse.json({ error: 'Unsupported embed URL.' }, { status: 400, headers });
  }
  // Resolve and read in this invocation: browser-issued tokens fail from Vercel.
  const resolved = await client.fetch(EMBED_ST_FETCH_URL, {
    method: 'POST',
    headers: { ...providerHeaders, 'Content-Type': 'application/octet-stream' },
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
    rootUrl = decodeEmbedStResponse(await resolved.bytes(), resolved.headers.get('goat'));
  } catch {
    return NextResponse.json({ error: 'The provider response could not be authenticated or decoded.' }, { status: 502, headers });
  }
  let url: string;
  try {
    url = resolveEmbedStVariant(rootUrl, params.get('variant'));
  } catch {
    return NextResponse.json({ error: 'Unsupported stream variant.' }, { status: 400, headers });
  }
  const upstream = await client.fetch(url, {
    headers: providerHeaders,
    redirect: 'error',
    signal: request.signal,
  });
  if (!upstream.ok) {
    log.warn(`stream manifest responded ${upstream.status}`);
    return NextResponse.json({ error: 'The provider rejected or could not serve this stream.' }, { status: 502, headers });
  }
  try {
    const manifest = await rewriteEmbedStManifest(await upstream.text(), url, rootUrl, embedUrl, async mediaUrl => {
      // Resolve the gateway's Location without downloading or relaying the video.
      const redirect = await client.fetch(mediaUrl, {
        method: 'HEAD',
        headers: providerHeaders,
        redirect: 'manual',
        signal: request.signal,
      });
      try {
        return { status: redirect.status, location: redirect.headers.get('location') };
      } finally {
        await redirect.body.cancel();
      }
    });
    return new NextResponse(manifest, {
      headers: { ...headers, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  } catch {
    return NextResponse.json({ error: 'The provider returned a manifest unsupported by Direct HQ playback.' }, { status: 502, headers });
  }
});
