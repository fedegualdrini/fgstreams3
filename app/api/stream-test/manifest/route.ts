import { NextResponse } from 'next/server';
import { STREAM_TEST_TIMEOUT_MS } from '@/lib/constants';
import { fetchText } from '@/lib/httpClient';
import { withErrorResponse } from '@/lib/httpRoute';
import { createLogger } from '@/lib/logger';
import { parseStreamTestManifestUrl, rewriteStreamTestManifest } from '@/lib/streamTestServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const log = createLogger('stream-test manifest');
const headers = { 'Cache-Control': 'no-store' };

export const GET = withErrorResponse('stream-test manifest', 'Unable to load stream manifest.', async request => {
  let url: URL;
  try {
    url = parseStreamTestManifestUrl(new URL(request.url).searchParams.get('url') ?? '');
  } catch {
    return NextResponse.json({ error: 'Unsupported stream manifest URL.' }, { status: 400, headers });
  }
  const text = await fetchText(url.href, {
    log,
    label: 'stream manifest',
    revalidate: 0,
    redirect: 'error',
    timeoutMs: STREAM_TEST_TIMEOUT_MS,
    headers: { Referer: 'https://embed.st/', Origin: 'https://embed.st' },
  });
  if (text === null) {
    return NextResponse.json({ error: 'The provider rejected or could not serve this stream.' }, { status: 502, headers });
  }
  try {
    return new NextResponse(rewriteStreamTestManifest(text, url.href), {
      headers: { ...headers, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  } catch {
    return NextResponse.json({ error: 'The provider returned an unsupported manifest.' }, { status: 502, headers });
  }
});
