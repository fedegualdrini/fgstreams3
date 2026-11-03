// @vitest-environment node
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type RequestOptions, type Server, type ServerResponse } from 'node:http';
import type * as HttpModule from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, constants, createGzip, deflateSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHlsProxyHandler, isPublicHlsAddress, signHlsUrl } from './hlsProxy';

const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: network.lookup }));
vi.mock('node:http', async importOriginal => ({ ...await importOriginal<typeof HttpModule>(), request: network.request }));
vi.mock('node:https', () => ({ request: network.request }));

const secret = 'b4'.repeat(32);
const relay = 'https://pc-relay.example/hls-proxy';
const bootstrap = 'https://bootstrap.example/master.m3u8';
const handle = createHlsProxyHandler(url => url.hostname === 'bootstrap.example');
let fixture: Server;
let serve: (request: IncomingMessage, response: ServerResponse) => void;

function request(url = bootstrap, options: { signed?: boolean; method?: string; range?: string; signal?: AbortSignal; signature?: string } = {}) {
  const params = new URLSearchParams({ url });
  if (options.signed || options.signature) params.set('sig', options.signature ?? signHlsUrl(url, secret));
  return new Request(`https://app.example/api/hls-proxy?${params}`, {
    method: options.method || 'GET', signal: options.signal,
    headers: options.range ? { Range: options.range } : {},
  });
}

beforeEach(async () => {
  vi.stubEnv('HLS_PROXY_SECRET', secret);
  vi.stubEnv('HLS_PROXY_RELAY_URL', relay);
  vi.stubEnv('HLS_PROXY_MODE', '');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('SITE_ID', '');
  network.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  network.request.mockReset();
  serve = (_request, response) => response.end('media');
  fixture = createServer((req, res) => serve(req, res));
  const listening = Promise.withResolvers<void>();
  fixture.listen(0, '127.0.0.1', () => listening.resolve());
  await listening.promise;
  const actual = await vi.importActual<typeof HttpModule>('node:http');
  // The production transport is exercised against an isolated server. Only the
  // final physical connect is replaced: tests inspect the real pinned lookup.
  network.request.mockImplementation((options: RequestOptions, callback: (response: IncomingMessage) => void) => actual.request({
    ...options, protocol: 'http:', hostname: '127.0.0.1', port: (fixture.address() as AddressInfo).port,
    lookup: undefined,
  }, callback));
});

afterEach(async () => {
  fixture.closeAllConnections();
  const closed = Promise.withResolvers<void>();
  fixture.close(() => closed.resolve());
  await closed.promise;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('HLS redirect control plane', () => {
  it('returns a small signed 307 with no fetch, DNS or upstream request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await handle(request());
    expect(response.status).toBe(307);
    const destination = new URL(response.headers.get('location')!);
    expect(`${destination.origin}${destination.pathname}`).toBe(relay);
    expect(destination.searchParams.get('url')).toBe(bootstrap);
    expect(destination.searchParams.get('sig')).toBe(createHmac('sha256', secret).update(bootstrap).digest('hex').slice(0, 32));
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(destination.toString()).not.toContain(secret);
    expect(network.lookup).not.toHaveBeenCalled();
    expect(network.request).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['Vercel', 'VERCEL', '1'],
    ['Netlify', 'SITE_ID', 'site-id'],
  ])('forces the control plane on %s even with origin explicitly enabled', async (_host, key, value) => {
    vi.stubEnv('HLS_PROXY_MODE', 'origin');
    vi.stubEnv(key, value);
    expect((await handle(request())).status).toBe(307);
    expect(network.lookup).not.toHaveBeenCalled();
    expect(network.request).not.toHaveBeenCalled();
  });

  it.each(['', 'fgstreams-hls-proxy', 'a'.repeat(63), 'z'.repeat(64)])('fails closed with malformed or absent secret %s', async value => {
    vi.stubEnv('HLS_PROXY_SECRET', value);
    expect((await handle(request())).status).toBe(503);
    expect(network.lookup).not.toHaveBeenCalled();
    expect(network.request).not.toHaveBeenCalled();
  });

  it.each(['', 'http://pc.example/hls-proxy', 'https://u:p@pc.example/hls-proxy', 'https://pc.example/hls-proxy?a=1', 'https://pc.example/hls-proxy#x', 'https://pc.example/hls-proxy?', 'https://pc.example/hls-proxy#'])('fails closed for unsafe relay configuration %s', async value => {
    vi.stubEnv('HLS_PROXY_RELAY_URL', value);
    expect((await handle(request())).status).toBe(503);
    expect(network.lookup).not.toHaveBeenCalled();
    expect(network.request).not.toHaveBeenCalled();
  });

  it('rejects unsigned arbitrary targets and known-default-key forgeries', async () => {
    const target = 'https://arbitrary.example/media.ts';
    expect((await handle(request(target))).status).toBe(403);
    const forged = createHmac('sha256', 'fgstreams-hls-proxy').update(target).digest('hex').slice(0, 32);
    expect((await handle(request(target, { signature: forged }))).status).toBe(403);
    expect((await handle(request(`${target}?changed=1`, { signature: signHlsUrl(target, secret) }))).status).toBe(403);
    expect((await handle(request(target, { signed: true }))).status).toBe(307);
    expect(network.request).not.toHaveBeenCalled();
  });

  it('keeps raw decoded URL signature binding, handles HEAD and serves CORS preflight locally', async () => {
    const target = 'https://cdn.example/a.ts?token=a%2Fb&x=1+2';
    const response = await handle(request(target, { signed: true, method: 'HEAD' }));
    expect(new URL(response.headers.get('location')!).searchParams.get('url')).toBe(target);
    expect(await response.text()).toBe('');
    const options = await handle(new Request('https://app.example/api/hls-proxy', { method: 'OPTIONS' }));
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-headers')).toBe('Range');
    expect(network.request).not.toHaveBeenCalled();
  });
});

describe('PC origin media plane', () => {
  beforeEach(() => vi.stubEnv('HLS_PROXY_MODE', 'origin'));

  it('rewrites variants, keys, maps, rendition and segments to absolute signed relay URLs after redirects', async () => {
    serve = (req, res) => {
      if (req.url === '/master.m3u8') { res.writeHead(302, { Location: 'https://cdn.example/live/index.m3u8' }); res.end(); return; }
      const body = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/list.m3u8"\nvariant.m3u8\nsegment.ts\n';
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
    };
    const response = await handle(request());
    const text = await response.text();
    const urls = [...text.matchAll(/https:\/\/pc-relay\.example\/hls-proxy\?[^"\s]+/g)].map(match => new URL(match[0]));
    expect(urls).toHaveLength(5);
    expect(urls.map(url => url.searchParams.get('url'))).toEqual(['key.bin', 'init.mp4', 'audio/list.m3u8', 'variant.m3u8', 'segment.ts'].map(path => `https://cdn.example/live/${path}`));
    for (const url of urls) expect(url.searchParams.get('sig')).toBe(signHlsUrl(url.searchParams.get('url')!, secret));
    expect(text).not.toContain('/api/hls-proxy');
    expect(text).not.toContain(secret);
    expect(response.headers.get('content-length')).toBeNull();
    expect(network.lookup).toHaveBeenCalledTimes(2);
  });

  it('supports explicitly local-only development without a public relay URL', async () => {
    vi.stubEnv('HLS_PROXY_RELAY_URL', '');
    serve = (_req, res) => { res.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); res.end('#EXTM3U\na.ts\n'); };
    expect(await (await handle(request())).text()).toContain('/api/hls-proxy?url=');
  });

  it('pins the validated address while retaining hostname, path and SNI input', async () => {
    const response = await handle(request('https://cdn.example/segment.ts?auth=x', { signed: true }));
    expect(await response.text()).toBe('media');
    const options = network.request.mock.calls[0][0] as RequestOptions;
    expect(options.hostname).toBe('cdn.example');
    expect(options.path).toBe('/segment.ts?auth=x');
    const pinned = vi.fn();
    options.lookup!('cdn.example', { family: 0 }, pinned);
    expect(pinned).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(network.lookup).toHaveBeenCalledTimes(1);
  });

  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '[::1]', '[fe80::1]', '[fd00::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::ffff:a00:1]'])('rejects signed private literal %s before connecting', async host => {
    expect((await handle(request(`http://${host}/media.ts`, { signed: true }))).status).toBe(403);
    expect(network.request).not.toHaveBeenCalled();
  });

  it('rejects any private DNS answer and revalidates every redirect destination', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }, { address: '::ffff:7f00:1', family: 6 }]);
    expect((await handle(request())).status).toBe(403);
    expect(network.request).not.toHaveBeenCalled();
    network.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    serve = (_req, res) => { res.writeHead(302, { Location: 'http://127.0.0.1/admin' }); res.end(); };
    expect((await handle(request())).status).toBe(403);
    expect(network.request).toHaveBeenCalledTimes(1);
  });

  it('blocks DNS rebinding on a subsequent redirect even back to the same hostname', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }]);
    serve = (_req, res) => { res.writeHead(302, { Location: '/next.m3u8' }); res.end(); };
    expect((await handle(request())).status).toBe(403);
    expect(network.request).toHaveBeenCalledTimes(1);
  });

  it('bounds redirect loops and playlist bodies', async () => {
    serve = (_req, res) => { res.writeHead(302, { Location: '/loop.m3u8' }); res.end(); };
    expect((await handle(request())).status).toBe(502);
    expect(network.request).toHaveBeenCalledTimes(6);
    serve = (_req, res) => res.end('#EXTM3U\n' + 'a'.repeat(2 * 1024 * 1024));
    expect((await handle(request())).status).toBe(502);
  });

  it('streams mislabelled AES keys without rewriting or changing their length', async () => {
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    serve = (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Content-Length': key.length }); res.end(key); };
    const response = await handle(request('https://cdn.example/key.bin', { signed: true }));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(key);
    expect(response.headers.get('content-length')).toBe('16');
  });

  it('forwards Range and preserves partial status and range metadata without browser credentials', async () => {
    serve = (req, res) => {
      expect(req.headers.range).toBe('bytes=2-5');
      expect(req.headers.authorization).toBeUndefined();
      expect(req.headers.cookie).toBeUndefined();
      res.writeHead(206, { 'Content-Type': 'video/mp2t', 'Content-Range': 'bytes 2-5/10', 'Accept-Ranges': 'bytes', 'Content-Length': '4' });
      res.end('2345');
    };
    const input = request('https://cdn.example/media.ts', { signed: true, range: 'bytes=2-5' });
    input.headers.set('Authorization', 'private-browser-token');
    input.headers.set('Cookie', 'session=private');
    const response = await handle(input);
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('2345');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-length')).toBe('4');
  });

  it('preserves upstream 416 and HEAD metadata without a body', async () => {
    serve = (req, res) => { res.writeHead(req.method === 'HEAD' ? 200 : 416, { 'Content-Range': 'bytes */10', 'Content-Length': '0' }); res.end(); };
    expect((await handle(request('https://cdn.example/media.ts', { signed: true, range: 'bytes=20-' }))).status).toBe(416);
    const response = await handle(request('https://cdn.example/media.ts', { signed: true, method: 'HEAD' }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-length')).toBe('0');
  });

  it.each(['gzip', 'deflate', 'br'])('decodes %s playlists before rewriting and removes compressed metadata', async encoding => {
    const body = Buffer.from('#EXTM3U\nsegment.ts\n');
    const compressed = encoding === 'gzip' ? gzipSync(body) : encoding === 'deflate' ? deflateSync(body) : brotliCompressSync(body);
    serve = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Content-Encoding': encoding, 'Content-Length': compressed.length });
      res.end(compressed);
    };
    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`${relay}?url=`);
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-encoding')).toBeNull();
  });

  it('streams decoded media and rejects unsupported encodings, corrupt data and compressed partial responses', async () => {
    const compressed = gzipSync(Buffer.from('decoded media'));
    serve = (_req, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': compressed.length }); res.end(compressed); };
    const response = await handle(request('https://cdn.example/media.ts', { signed: true }));
    expect(await response.text()).toBe('decoded media');
    expect(response.headers.get('content-length')).toBeNull();
    serve = (_req, res) => { res.writeHead(200, { 'Content-Encoding': 'unknown' }); res.end('media'); };
    expect((await handle(request())).status).toBe(502);
    serve = (_req, res) => { res.writeHead(206, { 'Content-Encoding': 'gzip', 'Content-Range': 'bytes 0-9/20' }); res.end(compressed); };
    expect((await handle(request('https://cdn.example/media.ts', { signed: true, range: 'bytes=0-9' }))).status).toBe(502);
    serve = (_req, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end('corrupt compressed data'); };
    expect((await handle(request())).status).toBe(502);
    const brokenMedia = await handle(request('https://cdn.example/media.ts', { signed: true }));
    await expect(brokenMedia.text()).rejects.toThrow();
  });

  it('bounds decompressed playlist bytes rather than compressed bytes', async () => {
    const compressed = gzipSync(Buffer.from('#EXTM3U\n' + 'a'.repeat(2 * 1024 * 1024)));
    serve = (_req, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end(compressed); };
    expect((await handle(request())).status).toBe(502);
  });

  it('bounds response headers and rewrites full playlists when an upstream ignores Range', async () => {
    serve = (_req, res) => { res.setHeader('X-Oversized', 'a'.repeat(20 * 1024)); res.end('media'); };
    expect((await handle(request())).status).toBe(502);
    serve = (_req, res) => res.end('#EXTM3U\nsegment.ts\n');
    const response = await handle(request(bootstrap, { range: 'bytes=0-' }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`${relay}?url=`);
  });

  it.each([
    { kind: 'signal', compressed: false }, { kind: 'body', compressed: false },
    { kind: 'signal', compressed: true }, { kind: 'body', compressed: true },
  ])('cancels upstream media on $kind cancellation (compressed=$compressed)', async ({ kind, compressed }) => {
    const disconnected = Promise.withResolvers<void>();
    serve = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'video/mp2t', ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) });
      if (compressed) {
        const encoder = createGzip();
        encoder.pipe(res);
        encoder.write('first');
        encoder.flush(constants.Z_SYNC_FLUSH);
        res.once('close', () => { encoder.destroy(); disconnected.resolve(); });
      } else {
        res.write('first');
        res.once('close', () => disconnected.resolve());
      }
    };
    const controller = new AbortController();
    const response = await handle(request('https://cdn.example/media.ts', { signed: true, signal: controller.signal }));
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    if (kind === 'signal') { controller.abort(); await reader.read().catch(() => undefined); }
    else await reader.cancel();
    await disconnected.promise;
  });
});

describe('global address classification', () => {
  it.each(['0.0.0.0', '100.64.0.1', '172.31.255.255', '192.168.1.1', '224.0.0.1', '::', '::1', 'fc00::1', 'fe90::1', '::ffff:c0a8:101', '2002:7f00:1::', '64:ff9b::7f00:1'])('rejects non-public %s', address => {
    expect(isPublicHlsAddress(address)).toBe(false);
  });
  it.each(['8.8.8.8', '93.184.216.34', '::ffff:808:808', '2606:4700:4700::1111', '2001:4860:4860::8888'])('allows public %s', address => {
    expect(isPublicHlsAddress(address)).toBe(true);
  });
});
