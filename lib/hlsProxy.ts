import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable, pipeline, type Transform } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const MAGIC = Buffer.from('#EXTM3U');
const CORS_HEADERS = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

class ForbiddenTarget extends Error {}

export function signHlsUrl(url: string, secret: string): string {
  return createHmac('sha256', secret).update(url).digest('hex').slice(0, 32);
}

function signatureMatches(url: string, provided: string | null, secret: string): boolean {
  if (!provided || !/^[a-f0-9]{32}$/.test(provided)) return false;
  return timingSafeEqual(Buffer.from(signHlsUrl(url, secret)), Buffer.from(provided));
}

function targetUrl(raw: string): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new ForbiddenTarget();
  }
  return url;
}

/** Only global unicast destinations are useful for a PC-hosted media proxy. */
export function isPublicHlsAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6) return false;
  // URL canonicalization expands dotted mapped IPv4 to hex; handle both spellings.
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  if (canonical.startsWith('::ffff:')) {
    const words = canonical.slice(7).split(':');
    if (words.length !== 2) return false;
    const value = parseInt(words[0], 16) * 65536 + parseInt(words[1], 16);
    return isPublicHlsAddress([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.'));
  }
  // Excludes unspecified, loopback, ULA, link/site-local, multicast and transition
  // mechanisms (e.g. NAT64 / IPv4-compatible) which can reach private IPv4.
  const [first, second] = canonical.split(':').map(word => parseInt(word, 16));
  return first >= 0x2000 && first <= 0x3fff
    && !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
    && first !== 0x2002 // 6to4 embeds an IPv4 destination
    && first !== 0x3fff; // documentation
}

async function publicAddress(url: URL): Promise<{ address: string; family: number }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) {
    if (!isPublicHlsAddress(hostname)) throw new ForbiddenTarget();
    return { address: hostname, family: isIP(hostname) };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !isPublicHlsAddress(entry.address))) {
    throw new ForbiddenTarget();
  }
  return addresses.find(entry => entry.family === 4) ?? addresses[0];
}

async function requestOnce(url: URL, method: string, range: string | null, signal: AbortSignal): Promise<IncomingMessage> {
  signal.throwIfAborted();
  const pinned = await publicAddress(url);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const options: RequestOptions = {
      protocol: url.protocol, hostname, port: url.port || undefined,
      path: `${url.pathname}${url.search}`, method,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
      // Revalidate DNS per hop and pin every new connection. Reusing an already
      // connected public socket cannot rebind it onto the PC's private network.
      family: pinned.family,
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
      maxHeaderSize: 16 * 1024,
      signal,
    };
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(options, response => {
      clearTimeout(headerTimeout);
      // Abort must remain wired after headers, until the body closes.
      const abort = () => response.destroy(new Error('Client disconnected'));
      signal.addEventListener('abort', abort, { once: true });
      response.once('close', () => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
      resolve(response);
    });
    const headerTimeout = setTimeout(() => request.destroy(new Error('Upstream headers timeout')), 20_000);
    request.setTimeout(30_000, () => request.destroy(new Error('Upstream timeout')));
    request.once('error', error => { clearTimeout(headerTimeout); reject(error); });
    request.end();
  });
}

async function upstreamResponse(raw: string, method: string, range: string | null, signal: AbortSignal) {
  let url = targetUrl(raw);
  for (let redirects = 0; ; redirects++) {
    const response = await requestOnce(url, method, range, signal);
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      const location = response.headers.location;
      response.destroy();
      if (!location || redirects >= 5) throw new Error('Invalid upstream redirect');
      url = targetUrl(new URL(location, url).toString());
      continue;
    }
    return { response, url };
  }
}

function proxyPath(url: string, secret: string, relay: string): string {
  return `${relay || '/api/hls-proxy'}?url=${encodeURIComponent(url)}&sig=${signHlsUrl(url, secret)}`;
}

function rewritePlaylist(text: string, base: URL, secret: string, relay: string): string {
  const rewrite = (uri: string) => proxyPath(targetUrl(new URL(uri, base).toString()).toString(), secret, relay);
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewrite(uri)}"`);
    return rewrite(trimmed);
  }).join('\n');
}

function responseHeaders(upstream: IncomingMessage): Headers {
  const headers = new Headers(CORS_HEADERS);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream');
  return headers;
}

// Only sniff hinted playlists. Mislabelled AES keys and segments remain streams,
// while real playlists have a hard bound before any text decoding or rewriting.
async function playlistBody(upstream: Readable, base: URL, secret: string, relay: string): Promise<{ body: BodyInit; rewritten: boolean }> {
  const iterator = upstream[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let size = 0;
  let ended = false;
  while (size < MAGIC.length) {
    const item = await iterator.next();
    if (item.done) { ended = true; break; }
    const chunk: Buffer = item.value;
    chunks.push(chunk);
    size += chunk.length;
  }
  if (!Buffer.concat(chunks, size).subarray(0, MAGIC.length).equals(MAGIC)) {
    // The generator's finally also tears down the original request on cancel.
    const source = Readable.from((async function* () {
      try {
        yield* chunks;
        if (!ended) for (;;) {
          const item = await iterator.next();
          if (item.done) break;
          yield item.value;
        }
      } finally { upstream.destroy(); }
    })());
    source.once('close', () => upstream.destroy());
    return {
      body: Readable.toWeb(source, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>,
      rewritten: false,
    };
  }
  while (!ended) {
    if (size > MAX_PLAYLIST_BYTES) { upstream.destroy(); throw new Error('Playlist too large'); }
    const item = await iterator.next();
    if (item.done) break;
    const chunk: Buffer = item.value;
    chunks.push(chunk);
    size += chunk.length;
  }
  if (size > MAX_PLAYLIST_BYTES) throw new Error('Playlist too large');
  return { body: rewritePlaylist(Buffer.concat(chunks, size).toString('utf8'), base, secret, relay), rewritten: true };
}

function reply(message: string, status: number, head = false): Response {
  return new Response(head ? null : message, { status, headers: CORS_HEADERS });
}

/** Default is a control-plane redirect; only an explicit non-Vercel origin fetches. */
export function createHlsProxyHandler(isBootstrap: (url: URL) => boolean) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    const head = request.method === 'HEAD';
    const secret = process.env.HLS_PROXY_SECRET;
    const mode = process.env.VERCEL === '1' ? 'redirect' : (process.env.HLS_PROXY_MODE || 'redirect');
    let relay = process.env.HLS_PROXY_RELAY_URL || '';
    try {
      if (!secret || !/^[a-f0-9]{64}$/i.test(secret) || !['origin', 'redirect'].includes(mode)) throw new Error();
      if (relay) {
        const parsed = new URL(relay);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
          || relay.includes('?') || relay.includes('#')) throw new Error();
        relay = parsed.toString();
      } else if (mode !== 'origin') throw new Error();
    } catch { return reply('HLS proxy unavailable', 503, head); }

    const params = new URL(request.url).searchParams;
    const raw = params.get('url');
    if (!raw) return reply('Missing url parameter', 400, head);
    let parsed: URL;
    try { parsed = targetUrl(raw); }
    catch (error) { return reply(error instanceof ForbiddenTarget ? 'Forbidden' : 'Invalid url', error instanceof ForbiddenTarget ? 403 : 400, head); }
    if (!signatureMatches(raw, params.get('sig'), secret!) && !isBootstrap(parsed)) return reply('Forbidden', 403, head);

    if (mode === 'redirect') {
      return new Response(null, { status: 307, headers: { ...CORS_HEADERS, Location: proxyPath(raw, secret!, relay) } });
    }
    try {
      const { response: upstream, url } = await upstreamResponse(raw, head ? 'HEAD' : 'GET', request.headers.get('range'), request.signal);
      const status = upstream.statusCode ?? 502;
      const headers = responseHeaders(upstream);
      const hinted = /mpegurl/i.test(headers.get('content-type') || '') || /\.m3u8?(?:$|[?#])/i.test(url.toString()) || /\.m3u8?(?:$|[?#])/i.test(raw);
      const encoding = (upstream.headers['content-encoding'] || 'identity').trim().toLowerCase();
      let decode: (() => Transform) | undefined;
      if (encoding !== 'identity') {
        if (encoding === 'gzip' || encoding === 'x-gzip') decode = createGunzip;
        else if (encoding === 'deflate') decode = createInflate;
        else if (encoding === 'br') decode = createBrotliDecompress;
        if (!decode || status === 206 || headers.has('content-range')) {
          upstream.destroy();
          throw new Error('Unsupported upstream encoding or compressed partial response');
        }
        // Like fetch, decode before inspecting playlists or streaming media.
        // Compressed lengths and byte offsets do not describe decoded bytes.
        headers.delete('Content-Length');
        headers.delete('Content-Encoding');
        headers.delete('Accept-Ranges');
      }
      if (head || [204, 205, 304].includes(status)) {
        if (head && hinted) headers.delete('Content-Length');
        upstream.destroy();
        return new Response(null, { status, headers });
      }
      let source: Readable = upstream;
      if (decode) {
        const decoder = decode();
        // Pipeline propagates raw errors/abort to the decoder and decoder errors
        // or downstream cancellation back to the original network response.
        source = pipeline(upstream, decoder, error => {
          if (error) decoder.destroy(error);
        });
      }
      // A partial manifest cannot be rewritten without invalidating byte offsets.
      if (hinted && status === 200) {
        const result = await playlistBody(source, url, secret!, relay);
        if (result.rewritten) {
          headers.set('Content-Type', 'application/vnd.apple.mpegurl');
          headers.delete('Content-Length');
          headers.delete('Content-Range');
          headers.delete('Accept-Ranges');
        }
        return new Response(result.body, { status, headers });
      }
      const body = Readable.toWeb(source, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>;
      return new Response(body, { status, headers });
    } catch (error) {
      return reply(error instanceof ForbiddenTarget ? 'Forbidden' : 'Upstream fetch failed', error instanceof ForbiddenTarget ? 403 : 502, head);
    }
  };
}
