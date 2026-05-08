import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
  '45.5.151.147',
  '190.61.41.181',
  '138.59.227.20',
  '177.74.205.189',
  '201.217.246.42',
  '191.97.59.33',
]);

function isM3U8(contentType: string, url: string): boolean {
  return (
    contentType.includes('mpegurl') ||
    contentType.includes('x-mpegurl') ||
    url.includes('.m3u8') ||
    url.includes('.m3u')
  );
}

function rewriteM3U8(text: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) return line;
      try {
        const absolute = new URL(trimmed, base).toString();
        if (absolute.startsWith('http://')) {
          return `/api/hls-proxy?url=${encodeURIComponent(absolute)}`;
        }
        return absolute;
      } catch {
        return line;
      }
    })
    .join('\n');
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(rawUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
  } catch {
    return new NextResponse('Upstream fetch failed', { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';

  if (isM3U8(contentType, rawUrl)) {
    const text = await upstream.text();
    const rewritten = rewriteM3U8(text, rawUrl);
    return new NextResponse(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
