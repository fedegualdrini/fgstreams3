import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { GENERATED_PROXY_HOSTS } from '@/lib/proxyHosts';

// Hand-maintained origins that predate the playlist importer.
const STATIC_HOSTS = [
  '45.5.151.147',
  '190.61.41.181',
  '138.59.227.20',
  '177.74.205.189',
  '201.217.246.42',
  '191.97.59.33',
];

// Entry points: the origins named by an option in public/channels.json.
const ALLOWED_HOSTS = new Set([...STATIC_HOSTS, ...GENERATED_PROXY_HOSTS]);

// Manifests redirect and point at CDN hosts that cannot be known in advance, so
// every URL this route hands back is signed and a signed URL is trusted on its
// own. Set HLS_PROXY_SECRET in production; without it the signature only proves
// the URL came from a manifest, which is why the address guard below is what
// actually keeps the proxy off private networks.
const SIGNING_SECRET = process.env.HLS_PROXY_SECRET ?? 'fgstreams-hls-proxy';

function sign(url: string): string {
  return createHmac('sha256', SIGNING_SECRET).update(url).digest('hex').slice(0, 32);
}

function signatureMatches(url: string, provided: string | null): boolean {
  if (!provided) return false;
  const expected = Buffer.from(sign(url));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function proxyPath(url: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(url)}&sig=${sign(url)}`;
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const v6 = address.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')) return true;
    // IPv4-mapped addresses such as ::ffff:169.254.169.254
    const mapped = v6.split(':').pop() ?? '';
    return mapped.includes('.') ? isPrivateAddress(mapped) : false;
  }
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Blocks loopback, link-local and RFC1918 targets — including a hostname that
 *  resolves to one — so the proxy can never be pointed at internal services. */
async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.length > 0 && addresses.every(a => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

function isM3U8(contentType: string, url: string): boolean {
  return (
    contentType.includes('mpegurl') ||
    contentType.includes('x-mpegurl') ||
    url.includes('.m3u8') ||
    url.includes('.m3u')
  );
}

// A manifest only reaches the proxy because the browser cannot fetch that origin
// itself, so its variants, keys and segments have to come back through the proxy
// too. `baseUrl` is the URL the response actually came from: these manifests
// redirect to a stitcher host and then use relative paths against it.
function rewriteM3U8(text: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed === '') return line;
      if (trimmed.startsWith('#')) {
        // EXT-X-KEY, EXT-X-MAP and EXT-X-MEDIA point at fetchable resources.
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          try {
            return `URI="${proxyPath(new URL(uri, base).toString())}"`;
          } catch {
            return match;
          }
        });
      }
      try {
        return proxyPath(new URL(trimmed, base).toString());
      } catch {
        return line;
      }
    })
    .join('\n');
}

const M3U8_MAGIC = '#EXTM3U';

/** Every proxied response is uncacheable and readable cross-origin by the player. */
function proxied(body: BodyInit | null, contentType: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
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

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const signed = signatureMatches(rawUrl, req.nextUrl.searchParams.get('sig'));
  if (!signed && !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!(await resolvesToPublicAddress(parsed.hostname))) {
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
  const finalUrl = upstream.url || rawUrl;

  // AES-128 keys sit next to the segments and are served with the playlist's own
  // content type, so the payload itself decides: only a real #EXTM3U body gets
  // rewritten, and a 16-byte key is passed through untouched.
  if (isM3U8(contentType, finalUrl) || isM3U8(contentType, rawUrl)) {
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.subarray(0, M3U8_MAGIC.length).toString('utf8') === M3U8_MAGIC) {
      return proxied(rewriteM3U8(body.toString('utf8'), finalUrl), 'application/vnd.apple.mpegurl');
    }
    return proxied(body, 'application/octet-stream');
  }

  return proxied(upstream.body, contentType);
}
