// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadStreamFreeManifest, parseStreamFreeEmbed, resolveStreamFreeVariant,
  rewriteStreamFreeManifest, streamFreeRootManifest, validateStreamFreeVariant,
} from './streamfreeServer';
import { streamFreeManifestPath } from './streamfreeDirect';
import { GET } from '../app/api/streamfree/manifest/route';

const now = Date.now();
const expiry = Math.floor(now / 1000) + 3600;
const signature = { _t: 'EpZog6S7RTPKJx7ExD51ZQ', _e: expiry, _n: '3ceb3bb7299bc786' };
const embed = 'https://strmfree.st/embed/basketball/example-game1080p2';
const metadata = { stream_key: 'example-game', is_external: false, server_name: 'externalcdn', server_domain: '' };
const media = 'https://p16-oec-general-useast5.ttcdn-us.com/obj/tos-useast5-i-omjb5zjo8w-tx/abc123';
const manifest = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXT-X-MEDIA-SEQUENCE:21\n#EXTINF:4.004,\n${media}\n`;

function html(key = 'example-game', quality = '1080p', suffix = '2', signing: unknown = signature): string {
  return `<script>const SOURCE_SUFFIX = '${suffix}';\nconst QUALITY = '${quality}';\nconst VARIANT = '${key}' + QUALITY + SOURCE_SUFFIX;\nconst _0x = ${JSON.stringify({ [quality]: signing })};</script>`;
}

function root(signing = signature, route = 'live-externalcdn'): string {
  return `https://strmfree.st/${route}/example-game1080p2/index.m3u8?${new URLSearchParams({ _t: signing._t, _e: String(signing._e), _n: signing._n })}`;
}

function request(embedUrl = embed, variant?: string, signal?: AbortSignal): Request {
  const url = new URL(streamFreeManifestPath(embedUrl, variant), 'https://app.example');
  return new Request(url, { signal });
}

function upstreamResponses(...responses: Response[]) {
  const fetcher = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected upstream request.');
    return response;
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

function resolvedResponses(playlist = manifest, meta: unknown = metadata): Response[] {
  return [new Response(html()), Response.json(meta), new Response(playlist)];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('StreamFree literal signing parser', () => {
  it.each([
    ['example-game', '1080p', ''], ['example-game', '1080p', '2'],
    ['example-game', '720p', ''], ['example-game', '2160p', '2'], ['skyf1', '1080p', ''],
  ])('matches the requested key/quality/source without stripping key digits: %s %s %s', (key, quality, suffix) => {
    const url = `https://strmfree.st/embed/tv/${key}${quality}${suffix}`;
    expect(parseStreamFreeEmbed(html(key, quality, suffix), url, now)).toEqual({ key, quality, suffix, variant: key + quality + suffix, signature });
  });

  it('resolves bare API embeds to the same key default source, including keys ending in digits', () => {
    for (const key of ['example-game', 'skyf1']) {
      const bare = `https://strmfree.st/embed/tv/${key}`;
      expect(parseStreamFreeEmbed(html(key, '1080p', ''), bare, now).variant).toBe(`${key}1080p`);
      expect(() => parseStreamFreeEmbed(html(key, '1080p', '2'), bare, now)).toThrow();
      expect(() => parseStreamFreeEmbed(html('different-key', '1080p', ''), bare, now)).toThrow();
    }
  });

  it('selects the requested quality from multiline JSON without executing scripts', () => {
    const source = html().replace(JSON.stringify({ '1080p': signature }), JSON.stringify({ '720p': { ...signature, _t: 'differentToken012345678' }, '1080p': signature }, null, 2));
    expect(parseStreamFreeEmbed(`${source}<script>throw new Error('must not run');</script>`, embed, now).signature).toEqual(signature);
  });

  it.each([
    null, {}, { ...signature, _e: Math.floor(now / 1000) }, { ...signature, _e: expiry + 0.5 },
    { ...signature, _e: String(expiry) }, { ...signature, _e: Number.MAX_SAFE_INTEGER + 1 },
    { ...signature, _n: 'not-a-nonce' }, { ...signature, _t: 'bad&redirect=http://127.0.0.1' },
  ])('rejects missing, expired, or malformed signing metadata: %j', signing => {
    expect(() => parseStreamFreeEmbed(html('example-game', '1080p', '2', signing), embed, now)).toThrow();
  });

  it.each([
    html('other-game'), html('example-game', '720p'), html('example-game', '1080p', ''),
    html().replace(' + QUALITY + SOURCE_SUFFIX', ' + window.location.hash'),
    html().replace('const _0x = ', 'const _0x = fetch('),
    html().replace('"1080p":', '"720p":'),
    html() + "const QUALITY = '1080p';", html().replace('"_e":', '_e:'),
  ])('rejects mismatched constants or nonliteral signing data', source => {
    expect(() => parseStreamFreeEmbed(source, embed, now)).toThrow();
  });

  it('bounds signing JSON independently from the embed HTML', () => {
    const source = html().replace('const _0x = ', `const _0x = {"unused":"${'x'.repeat(16 * 1024)}", "selected":`);
    expect(() => parseStreamFreeEmbed(source, embed, now)).toThrow();
    expect(() => parseStreamFreeEmbed('x'.repeat(512 * 1024 + 1), embed, now)).toThrow();
  });
});

describe('StreamFree metadata routing', () => {
  it.each([
    ['origin', 'live'], ['cdn', 'live-cdn'], ['externalcdn', 'live-externalcdn'],
  ])('maps server %s to a provider-local %s route', (server_name, route) => {
    const data = parseStreamFreeEmbed(html(), embed, now);
    expect(streamFreeRootManifest(embed, data, { ...metadata, server_name, server_domain: 'https://127.0.0.1/private' })).toBe(root(signature, route));
  });

  it('uses the validated alias origin, not server_domain', () => {
    const alias = embed.replace('strmfree.st', 'streamfree.top');
    const data = parseStreamFreeEmbed(html(), alias, now);
    expect(new URL(streamFreeRootManifest(alias, data, metadata)).origin).toBe('https://streamfree.top');
  });

  it.each([
    { ...metadata, is_external: true, external_url: 'https://127.0.0.1/private.m3u8' },
    { ...metadata, is_external: 'false' }, { ...metadata, stream_key: 'different-game' },
    { ...metadata, server_name: '../../admin' }, null,
  ])('rejects unsupported or cross-stream metadata', meta => {
    expect(() => streamFreeRootManifest(embed, parseStreamFreeEmbed(html(), embed, now), meta)).toThrow();
  });
});

describe('StreamFree playlist boundary and renewal', () => {
  it('retains the HLS timeline and leaves verified media browser-direct', async () => {
    expect(await rewriteStreamFreeManifest(manifest, root(), root(), embed)).toBe(manifest);
  });

  it('renews nested playlists relative to each fetched level while preserving nonauth query fields', async () => {
    const text = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,NAME="audio,URI=not-a-target",URI="../audio/main.m3u8?_t=old&_e=1&_n=old&lang=en"\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\nvideo.m3u8?_t=old&_e=1&_n=old\n';
    const base = resolveStreamFreeVariant(root(), 'high/master.m3u8');
    const result = await rewriteStreamFreeManifest(text, base, root(), embed);
    expect(result).toContain(`URI="${streamFreeManifestPath(embed, 'audio/main.m3u8?lang=en')}"`);
    const nested = new URL(result.split('\n')[3], 'https://app.example');
    expect(nested.pathname).toBe('/api/streamfree/manifest');
    expect(nested.searchParams.get('variant')).toBe('high/video.m3u8');
    const renewed = { ...signature, _t: 'newToken012345678901234', _e: expiry + 120, _n: '0123456789abcdef' };
    expect(resolveStreamFreeVariant(root(renewed), nested.searchParams.get('variant'))).toBe(root(renewed).replace('/index.m3u8?', '/high/video.m3u8?'));
    expect(result).not.toContain('_t=old');
    expect(result).toContain('NAME="audio,URI=not-a-target"');
  });

  it('replaces stale authentication even when supplied explicitly on a variant', () => {
    const resolved = new URL(resolveStreamFreeVariant(root(), 'high.m3u8?_t=expired&_e=1&_n=expired&lang=en'));
    expect(resolved.searchParams.get('_t')).toBe(signature._t);
    expect(resolved.searchParams.get('_e')).toBe(String(expiry));
    expect(resolved.searchParams.get('_n')).toBe(signature._n);
    expect(resolved.searchParams.get('lang')).toBe('en');
  });

  it.each([
    '', '../index.m3u8', 'high/../../other/index.m3u8', '/live/other/index.m3u8',
    '//127.0.0.1/index.m3u8', 'https://strmfree.st/live/other/index.m3u8',
    'https://127.0.0.1/index.m3u8', 'high/%2e%2e/index.m3u8', 'high\\index.m3u8',
    'high.m3u8#fragment', 'high.m3u8\n', 'high.m3u8?name=%0aevil', 'segment.ts',
  ])('rejects arbitrary route variants before fetching: %s', variant => {
    expect(() => validateStreamFreeVariant(variant)).toThrow();
    expect(() => resolveStreamFreeVariant(root(), variant)).toThrow();
  });

  it.each([
    'https://127.0.0.1/stream.m3u8', 'https://streamfree.top/live-externalcdn/example-game1080p2/index.m3u8',
    '../other1080p2/index.m3u8', '/live/example-game1080p2/index.m3u8',
    'https://strmfree.st:444/live-externalcdn/example-game1080p2/index.m3u8',
    'https://user@strmfree.st/live-externalcdn/example-game1080p2/index.m3u8',
    'https://strmfree.st/live-externalcdn/example-game1080p2/%2e%2e/other/index.m3u8',
    'https://p16-oec-general-useast5.ttcdn-us.com.evil.example/obj/bucket/abc',
    'https://p16-oec-general-useast5.ttcdn-us.com/private/abc',
    'https://p16-oec-general-useast5.ttcdn-us.com:444/obj/bucket/abc',
    'https://user@p16-oec-general-useast5.ttcdn-us.com/obj/bucket/abc',
    'https://cdn1.strmfree.st/live/example-game1080p2/segment.ts',
    'http://p16-oec-general-useast5.ttcdn-us.com/obj/bucket/abc',
    'data:application/octet-stream;base64,AA==', 'file:///private', 'segment.ts',
  ])('rejects unverified manifest resources in lines and URI attributes: %s', async resource => {
    await expect(rewriteStreamFreeManifest(`#EXTM3U\n${resource}`, root(), root(), embed)).rejects.toThrow();
    await expect(rewriteStreamFreeManifest(`#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="${resource}"`, root(), root(), embed)).rejects.toThrow();
  });

  it.each([
    '#EXT-X-KEY:METHOD=AES-128,URI=https://127.0.0.1/key',
    '#EXT-X-KEY:METHOD=AES-128,URI = "https://127.0.0.1/key"',
    '#EXT-X-CONTENT-STEERING:SERVER-URI="https://127.0.0.1/steering"',
    '#EXT-X-DEFINE:NAME="target",VALUE="https://127.0.0.1/stream"',
    '#EXT-X-DATERANGE:ID="ad",X-ASSET-URI="https://127.0.0.1/ad.m3u8"',
    '#EXT-X-DATERANGE:ID="ad",X-ASSET-LIST="https://127.0.0.1/list"',
  ])('fails closed for indirect or unsupported HLS resource targets', async tag => {
    await expect(rewriteStreamFreeManifest(`#EXTM3U\n${tag}`, root(), root(), embed)).rejects.toThrow();
  });

  it('rejects non-HLS and oversized playlist responses', async () => {
    await expect(rewriteStreamFreeManifest('<html>Forbidden</html>', root(), root(), embed)).rejects.toThrow();
    await expect(rewriteStreamFreeManifest(`#EXTM3U\n${'#'.repeat(256 * 1024)}`, root(), root(), embed)).rejects.toThrow();
  });
});

describe('StreamFree public media destinations', () => {
  const restricted = 'https://cdn1.strmfree.st/live/example-game1080p2/42.js';
  const published = 'https://strmfree.st/live/example-game1080p2/42.js';
  const goodHeaders = { status: 200, contentType: 'application/javascript', contentLength: '660256', location: null };

  it('replaces protected media with a verified same-source public path, including URI attributes', async () => {
    const probe = vi.fn(async () => goodHeaders);
    const text = `#EXTM3U\n#EXT-X-MAP:URI="${restricted}"\n#EXTINF:4.004,\n${restricted}\n`;
    const result = await rewriteStreamFreeManifest(text, root(), root(), embed, probe);
    expect(result).toBe(text.replaceAll(restricted, published));
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('checks media already published on the provider site without exposing it unchecked', async () => {
    await expect(rewriteStreamFreeManifest(`#EXTM3U\n${published}`, root(), root(), embed)).rejects.toThrow();
    expect(await rewriteStreamFreeManifest(`#EXTM3U\n${published}`, root(), root(), embed, async () => goodHeaders))
      .toBe(`#EXTM3U\n${published}`);
  });

  it.each([
    'https://cdn1.strmfree.st/live/example-game1080p/42.js',
    'https://cdn1.strmfree.st/live/example-game720p2/42.js',
    'https://cdn1.strmfree.st/live/other-game1080p2/42.js',
    'https://cdn1.strmfree.st/live/example-game1080p2/segment.ts',
    'https://cdn1.strmfree.st/live/example-game1080p2/42.js?redirect=https://127.0.0.1/',
    'https://cdn1.strmfree.st.evil.example/live/example-game1080p2/42.js',
    'https://cdn1.strmfree.st:444/live/example-game1080p2/42.js',
    'https://streamfree.top/live/example-game1080p2/42.js',
    'https://strmfree.st/live/example-game1080p2/%2fprivate.js',
  ])('rejects cross-source, cross-quality and unverified public paths before probing: %s', async resource => {
    const probe = vi.fn(async () => goodHeaders);
    await expect(rewriteStreamFreeManifest(`#EXTM3U\n${resource}`, root(), root(), embed, probe)).rejects.toThrow();
    expect(probe).not.toHaveBeenCalled();
  });

  it.each([
    { ...goodHeaders, status: 403 },
    { ...goodHeaders, status: 302, location: 'https://127.0.0.1/private' },
    { ...goodHeaders, location: 'https://evil.example/segment' },
    { ...goodHeaders, contentType: 'text/html' },
    { ...goodHeaders, contentLength: '0' },
    { ...goodHeaders, contentLength: null },
  ])('fails locally when headers do not verify a public media response: %j', async headers => {
    await expect(rewriteStreamFreeManifest(`#EXTM3U\n${restricted}`, root(), root(), embed, async () => headers))
      .rejects.toThrow('no verified public destination');
  });

  it('bounds unique media probes instead of fanning out an oversized live window', async () => {
    const probe = vi.fn(async () => goodHeaders);
    const text = '#EXTM3U\n' + Array.from({ length: 33 }, (_, index) => restricted.replace('42.js', `${index}.js`)).join('\n');
    await expect(rewriteStreamFreeManifest(text, root(), root(), embed, probe)).rejects.toThrow('Too many');
    expect(probe).toHaveBeenCalledTimes(32);
  });

  it('relays no media bytes while resolving public destinations through the route', async () => {
    const pull = vi.fn();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const source = `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:42\n#EXTINF:4.004,\n${restricted}\n`;
    const fetcher = upstreamResponses(...resolvedResponses(source), new Response(body, {
      headers: { 'Content-Type': goodHeaders.contentType, 'Content-Length': goodHeaders.contentLength },
    }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(source.replace(restricted, published));
    const calls = fetcher.mock.calls as unknown[][];
    expect(calls[3][0]).toBe(published);
    expect(calls[3][1]).toMatchObject({ method: 'HEAD', redirect: 'manual', credentials: 'omit' });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not follow a public media redirect or expose its private destination', async () => {
    const fetcher = upstreamResponses(...resolvedResponses(`#EXTM3U\n${restricted}`), new Response(null, {
      status: 302, headers: { Location: 'https://127.0.0.1/private', 'Content-Type': 'text/html' },
    }));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe('StreamFree manifest route', () => {
  it('resolves source2 metadata and signed playlist without fetching media or sending cookies', async () => {
    const fetcher = upstreamResponses(...resolvedResponses());
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/vnd.apple.mpegurl');
    expect(await response.text()).toBe(manifest);
    expect(fetcher.mock.calls.map(call => (call as unknown[])[0])).toEqual([
      embed, 'https://strmfree.st/get-stream-key/example-game', root(),
    ]);
    for (const call of fetcher.mock.calls) {
      expect((call as unknown[])[1]).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: expect.any(AbortSignal) });
    }
  });

  it('resolves a fresh root for every nested request rather than retaining expired tokens', async () => {
    const newer = { ...signature, _t: 'renewedToken012345678901', _e: expiry + 120 };
    const fetcher = upstreamResponses(
      ...resolvedResponses('#EXTM3U\nhigh/main.m3u8?_t=stale&_e=1&_n=stale'),
      new Response(html('example-game', '1080p', '2', newer)), Response.json(metadata), new Response(manifest),
    );
    const first = await GET(request());
    const nested = (await first.text()).split('\n')[1];
    const second = await GET(new Request(new URL(nested, 'https://app.example')));
    expect(second.status).toBe(200);
    expect(await second.text()).toBe(manifest);
    const calls = fetcher.mock.calls as unknown[][];
    expect(calls[5][0]).toBe(root(newer).replace('/index.m3u8?', '/high/main.m3u8?'));
    expect(calls).toHaveLength(6);
  });

  it('returns uncached 400 for invalid embed or variant without contacting any upstream', async () => {
    const fetcher = upstreamResponses();
    const invalid = new Request('https://app.example/api/streamfree/manifest?embed=https%3A%2F%2F127.0.0.1%2Fprivate');
    for (const req of [invalid, request(embed, '../other/index.m3u8'), request(embed, 'https://127.0.0.1/private.m3u8')]) {
      const response = await GET(req);
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([301, 302, 307, 403, 500])('returns uncached 502 for provider status %s without following redirects', async status => {
    const fetcher = upstreamResponses(new Response('upstream private detail', { status, headers: { Location: 'https://127.0.0.1/private' } }));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('private');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not fetch external metadata URLs or relay signed upstream failures', async () => {
    const fetcher = upstreamResponses(...resolvedResponses(manifest, { ...metadata, is_external: true, external_url: 'https://127.0.0.1/private.m3u8' }));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const failed = vi.fn().mockRejectedValue(new Error(`connection failed ${root()}`));
    vi.stubGlobal('fetch', failed);
    const errorResponse = await GET(request());
    expect(errorResponse.status).toBe(502);
    expect(await errorResponse.text()).not.toContain(signature._t);
  });

  it('rejects oversized declared bodies before reading them', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = upstreamResponses(new Response(body, { headers: { 'Content-Length': String(512 * 1024 + 1) } }));
    expect((await GET(request())).status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['html', 512 * 1024, []],
    ['metadata', 16 * 1024, [new Response(html())]],
    ['manifest', 256 * 1024, [new Response(html()), Response.json(metadata)]],
  ] as const)('bounds streamed %s bytes without trusting content-length', async (_name, limit, prefix) => {
    const cancel = vi.fn();
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunks++ < 2) controller.enqueue(new Uint8Array(Math.floor(limit / 2) + 1).fill(65));
      },
      cancel,
    });
    const fetcher = upstreamResponses(...prefix, new Response(body));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(prefix.length + 1);
  });

  it('respects caller cancellation before fetch and while consuming a stalled body', async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const fetcher = upstreamResponses();
    await expect(loadStreamFreeManifest(embed, null, alreadyAborted.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();

    const controller = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull() { controller.abort(); }, cancel });
    upstreamResponses(new Response(body));
    const response = await GET(request(embed, undefined, controller.signal));
    expect(response.status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
