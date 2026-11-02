// @vitest-environment node

import { createHmac } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLpfRelay } from './lpf-relay.mjs';

const TOKEN = '8a4e6c09d2b7f135'.repeat(4);
const HLS_SECRET = '74bfe189badf0672'.repeat(4);
const SNAPSHOT = {
  channel: {
    name: 'LPF',
    logo: '/logos/lpf.png',
    show: true,
    options: Array.from({ length: 18 }, (_, index) => ({
      name: `Opción ${index + 1}`,
      sourceUrl: `https://provider.example/lpf/${index + 1}`,
      iframe: `https://cdn.example/lpf/${index + 1}/index.m3u8`,
      status: 'live',
      proxy: true,
    })),
  },
  checkedAt: 1_790_000_000_000,
};

const validConfig = { token: TOKEN, hlsProxySecret: HLS_SECRET, appPort: 3100, relayPort: 3101 };

function mediaPath(url = 'https://cdn.example/live/segment.ts?token=a%2Fb&part=1', secret = HLS_SECRET) {
  const sig = createHmac('sha256', secret).update(url).digest('hex').slice(0, 32);
  return `/hls-proxy?${new URLSearchParams({ url, sig })}`;
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function within(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out waiting for stream.')), 3000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('LPF relay configuration', () => {
  it.each([undefined, '', 'secret', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])(
    'rejects a missing or malformed private token (%s)',
    token => {
      expect(() => createLpfRelay({ ...validConfig, token })).toThrow();
    },
  );

  it.each([undefined, '', 'secret', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])(
    'rejects a missing or malformed HLS signing secret (%s)',
    hlsProxySecret => {
      expect(() => createLpfRelay({ ...validConfig, hlsProxySecret })).toThrow();
    },
  );

  it.each([0, -1, 65_536, 3100.5, '3100', undefined])('rejects invalid ports (%s)', port => {
    expect(() => createLpfRelay({ ...validConfig, appPort: port })).toThrow();
    expect(() => createLpfRelay({ ...validConfig, relayPort: port })).toThrow();
  });

  it('rejects forwarding to its own port', () => {
    expect(() => createLpfRelay({ ...validConfig, appPort: validConfig.relayPort })).toThrow();
  });
});

describe('LPF and media relay HTTP boundary', () => {
  let servers;
  let upstreamRequests;
  let upstreamHandler;
  let relayUrl;

  async function listen(server) {
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    return server.address().port;
  }

  beforeEach(async () => {
    servers = [];
    upstreamRequests = [];
    upstreamHandler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(SNAPSHOT));
    };
    const appPort = await listen(createServer((request, response) => {
      upstreamRequests.push({ method: request.method, url: request.url, headers: request.headers });
      upstreamHandler(request, response);
    }));
    const relayPort = await listen(createLpfRelay({
      token: TOKEN,
      hlsProxySecret: HLS_SECRET,
      appPort,
      relayPort: appPort === 3101 ? 3102 : 3101,
    }));
    relayUrl = `http://127.0.0.1:${relayPort}`;
  });

  afterEach(async () => {
    await Promise.all(servers.map(server => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    })));
  });

  it('never contacts the local API for missing or invalid authorization', async () => {
    for (const authorization of [undefined, TOKEN, `Basic ${TOKEN}`, `Bearer ${'0'.repeat(64)}`, `bearer ${TOKEN}`]) {
      const response = await fetch(`${relayUrl}/lpf`, {
        headers: authorization ? { Authorization: authorization } : {},
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'Unauthorized.' });
    }
    const forced = await fetch(`${relayUrl}/lpf`, { method: 'POST' });
    expect(forced.status).toBe(401);
    await forced.text();
    expect(upstreamRequests).toEqual([]);
  });

  it('returns the complete current snapshot through the one fixed local API', async () => {
    const response = await fetch(`${relayUrl}/lpf`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Cookie: 'private-client-cookie=do-not-forward',
        'X-Upstream-Url': 'https://attacker.example/stream.m3u8',
        Origin: 'https://fgstreams3.vercel.app',
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect([...response.headers.keys()].some(key => key.startsWith('access-control-'))).toBe(false);
    expect(upstreamRequests).toHaveLength(1);
    expect(upstreamRequests[0]).toMatchObject({
      method: 'GET',
      url: '/api/channels/lpf',
      headers: { accept: 'application/json' },
    });
    expect(upstreamRequests[0].headers.authorization).toBeUndefined();
    expect(upstreamRequests[0].headers.cookie).toBeUndefined();
    expect(upstreamRequests[0].headers['x-upstream-url']).toBeUndefined();
    expect(upstreamRequests[0].headers.origin).toBeUndefined();
  });


  it('does not expose other endpoints or accept URL and query forwarding', async () => {
    for (const path of ['/', '/lpf/', '/api/channels/lpf', '/.vercel/lpf-relay.json', '/lpf?url=https://attacker.example/', '/lpf?source=1']) {
      const response = await fetch(`${relayUrl}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found.' });
    }
    expect(upstreamRequests).toEqual([]);
  });

  it('rejects every unsupported HTTP method without fetching upstream or enabling CORS', async () => {
    for (const method of ['HEAD', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
      const response = await fetch(`${relayUrl}/lpf`, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'https://fgstreams3.vercel.app' },
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, POST');
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      await response.text();
    }
    expect(upstreamRequests).toEqual([]);
  });

  it('rejects a local API redirect without following it or exposing upstream details', async () => {
    upstreamHandler = (_request, response) => {
      response.writeHead(302, {
        'Content-Type': 'application/json',
        Location: '/private-redirect-target',
      });
      response.end(JSON.stringify({ error: `Private upstream detail: ${TOKEN}` }));
    };
    const response = await fetch(`${relayUrl}/lpf`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
    expect(await response.json()).toEqual({ error: 'LPF relay unavailable.' });
    expect(upstreamRequests).toHaveLength(1);
    expect(upstreamRequests[0].url).toBe('/api/channels/lpf');
  });

  it.each(['not JSON', 'null', '{"error":"private upstream failure"}', '{"channel":{"options":[]},"checkedAt":"invalid"}'])(
    'returns a generic 502 for an invalid local API body (%s)',
    async body => {
      upstreamHandler = (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(body);
      };
      const response = await fetch(`${relayUrl}/lpf`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'LPF relay unavailable.' });
    },
  );

  it('returns a generic 502 when the local API connection fails', async () => {
    upstreamHandler = request => request.socket.destroy();
    const response = await fetch(`${relayUrl}/lpf`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'LPF relay unavailable.' });
  });

  it('requires a URL-bound media signature even with LPF authorization or a bootstrap URL', async () => {
    const bootstrap = 'https://streamtp10.com/global1.php?stream=espn';
    const valid = new URL(mediaPath(), relayUrl);
    const forged = new URL(valid);
    forged.searchParams.set('url', 'https://attacker.example/private');
    const malformed = new URL(valid);
    malformed.searchParams.set('sig', 'z'.repeat(32));
    const uppercase = new URL(valid);
    uppercase.searchParams.set('sig', uppercase.searchParams.get('sig').toUpperCase());
    for (const path of [
      '/hls-proxy',
      `/hls-proxy?url=${encodeURIComponent(bootstrap)}`,
      mediaPath(bootstrap, 'lpf-hls-proxy-secret'),
      `${valid.pathname}${valid.search}&url=https://attacker.example/`,
      `${valid.pathname}${valid.search}&sig=${'0'.repeat(32)}`,
      `${forged.pathname}${forged.search}`,
      `${malformed.pathname}${malformed.search}`,
      `${uppercase.pathname}${uppercase.search}`,
      `/hls-proxy?url=${encodeURIComponent(bootstrap)}&sig=${'0'.repeat(31)}`,
      `/hls-proxy?url=${encodeURIComponent(bootstrap)}&sig=${'0'.repeat(33)}`,
      `/hls-proxy?url=${encodeURIComponent(bootstrap)}&sig=${'0'.repeat(32)}`,
    ]) {
      const response = await fetch(`${relayUrl}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      expect(response.status).toBe(401);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'Unauthorized.' });
    }
    const head = await fetch(`${relayUrl}/hls-proxy`, { method: 'HEAD' });
    expect(head.status).toBe(401);
    expect(await head.text()).toBe('');
    expect(upstreamRequests).toEqual([]);
  });

  it('answers unauthenticated media preflights without contacting the app', async () => {
    const response = await fetch(`${relayUrl}/hls-proxy`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://fgstreams3.vercel.app', 'Access-Control-Request-Headers': 'Range' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Range');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(await response.text()).toBe('');
    expect(upstreamRequests).toEqual([]);
  });

  it('rejects other media methods and path variants without reaching the app', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const response = await fetch(`${relayUrl}${mediaPath()}`, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
      await response.text();
    }
    for (const path of ['/hls-proxy/', '/hls-proxy/other', '/api/hls-proxy']) {
      const response = await fetch(`${relayUrl}${path}`);
      expect(response.status).toBe(404);
      await response.text();
    }
    expect(upstreamRequests).toEqual([]);
  });

  it('delivers exact partial bytes and browser-readable range headers without forwarding credentials', async () => {
    upstreamHandler = (_request, response) => {
      response.writeHead(206, {
        'Content-Type': 'video/mp2t',
        'Content-Length': '4',
        'Content-Range': 'bytes 2-5/10',
        'Accept-Ranges': 'bytes',
        'Set-Cookie': `private=${TOKEN}`,
        'X-Private-Detail': HLS_SECRET,
        'Access-Control-Allow-Origin': 'https://private.example',
      });
      response.end(Buffer.from([2, 3, 4, 5]));
    };
    const response = await fetch(`${relayUrl}${mediaPath()}&path=/private&port=1`, {
      headers: {
        Range: 'bytes=2-5',
        Authorization: `Bearer ${TOKEN}`,
        Cookie: 'private=do-not-forward',
        Origin: 'https://fgstreams3.vercel.app',
        'X-Upstream-Url': 'http://127.0.0.1/private',
      },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp2t');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-expose-headers')).toBe('Content-Length, Content-Range, Accept-Ranges');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-private-detail')).toBeNull();
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4, 5]);
    expect(upstreamRequests).toHaveLength(1);
    const forwarded = new URL(upstreamRequests[0].url, 'http://127.0.0.1');
    const expected = new URL(mediaPath(), relayUrl);
    expect(forwarded.pathname).toBe('/api/hls-proxy');
    expect([...forwarded.searchParams]).toEqual([...expected.searchParams]);
    expect(upstreamRequests[0].method).toBe('GET');
    expect(upstreamRequests[0].headers.range).toBe('bytes=2-5');
    for (const name of ['authorization', 'cookie', 'origin', 'x-upstream-url']) {
      expect(upstreamRequests[0].headers[name]).toBeUndefined();
    }
    expect(upstreamRequests[0].headers['accept-encoding']).toBe('identity');
  });

  it('preserves HEAD metadata and range errors', async () => {
    upstreamHandler = (_request, response) => {
      response.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Length': '25',
        'Content-Range': 'bytes 0-24/100',
        'Accept-Ranges': 'bytes',
      });
      response.end();
    };
    const head = await fetch(`${relayUrl}${mediaPath()}`, { method: 'HEAD', headers: { Range: 'bytes=0-24' } });
    expect(head.status).toBe(206);
    expect(head.headers.get('content-length')).toBe('25');
    expect(head.headers.get('content-range')).toBe('bytes 0-24/100');
    expect(head.headers.get('access-control-allow-origin')).toBe('*');
    expect(await head.text()).toBe('');
    expect(upstreamRequests[0].method).toBe('HEAD');
    upstreamHandler = (_request, response) => {
      response.writeHead(416, { 'Content-Range': 'bytes */100', 'Accept-Ranges': 'bytes' });
      response.end('Range not satisfiable');
    };
    const invalid = await fetch(`${relayUrl}${mediaPath()}`, { headers: { Range: 'bytes=500-' } });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get('content-range')).toBe('bytes */100');
    expect(await invalid.text()).toBe('Range not satisfiable');
  });

  it('streams the first bytes before the source completes instead of buffering the media', async () => {
    const finish = deferred();
    upstreamHandler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'video/mp2t' });
      response.write('first-chunk');
      void finish.promise.then(() => response.end('last-chunk'));
    };
    const pending = fetch(`${relayUrl}${mediaPath()}`);
    try {
      const response = await within(pending);
      const reader = response.body.getReader();
      const first = await within(reader.read());
      expect(new TextDecoder().decode(first.value)).toBe('first-chunk');
      expect(first.done).toBe(false);
      finish.resolve();
      const remainder = [];
      for (;;) {
        const next = await within(reader.read());
        if (next.done) break;
        remainder.push(new TextDecoder().decode(next.value));
      }
      expect(remainder.join('')).toBe('last-chunk');
    } finally {
      finish.resolve();
    }
  });

  it('preserves encoded bytes and matching wire length when a source ignores identity encoding', async () => {
    const text = 'video or playlist payload '.repeat(100);
    const compressed = gzipSync(text);
    upstreamHandler = (_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Content-Encoding': 'gzip',
        'Content-Length': String(compressed.length),
      });
      response.end(compressed);
    };
    const result = await within(new Promise((resolve, reject) => {
      const request = httpRequest(`${relayUrl}${mediaPath()}`, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.once('end', () => resolve({ headers: response.headers, body: Buffer.concat(chunks) }));
        response.once('error', reject);
      });
      request.once('error', reject);
      request.end();
    }));
    expect(result.headers['content-encoding']).toBe('gzip');
    expect(result.headers['content-length']).toBe(String(compressed.length));
    expect(result.body).toEqual(compressed);
    const browser = await fetch(`${relayUrl}${mediaPath()}`);
    expect(await browser.text()).toBe(text);
  });

  it('terminates a truncated media response instead of appending a JSON error to media bytes', async () => {
    const truncate = deferred();
    upstreamHandler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': '100' });
      response.write('first');
      void truncate.promise.then(() => response.destroy());
    };
    try {
      const response = await within(fetch(`${relayUrl}${mediaPath()}`));
      const reader = response.body.getReader();
      const first = await within(reader.read());
      expect(new TextDecoder().decode(first.value)).toBe('first');
      truncate.resolve();
      await expect(within(reader.read())).rejects.toThrow();
    } finally {
      truncate.resolve();
    }
  });

  it('does not follow or expose local redirects, or leak private headers', async () => {
    upstreamHandler = (_request, response) => {
      response.writeHead(307, { Location: `http://127.0.0.1/private?token=${TOKEN}`, 'Set-Cookie': `secret=${HLS_SECRET}` });
      response.end('private redirect');
    };
    const response = await fetch(`${relayUrl}${mediaPath()}`);
    expect(response.status).toBe(502);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({ error: 'Media relay unavailable.' });
    expect(upstreamRequests).toHaveLength(1);
  });

  it('returns a CORS-enabled generic failure when the media app disconnects before headers', async () => {
    upstreamHandler = request => request.socket.destroy();
    const response = await fetch(`${relayUrl}${mediaPath()}`);
    expect(response.status).toBe(502);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({ error: 'Media relay unavailable.' });
  });

  it('cancels the app request when the browser disconnects before response headers', async () => {
    const arrived = deferred();
    const closed = deferred();
    upstreamHandler = (_request, response) => {
      response.once('close', closed.resolve);
      arrived.resolve();
    };
    const request = httpRequest(`${relayUrl}${mediaPath()}`);
    request.on('error', () => {});
    request.end();
    try {
      await within(arrived.promise);
      request.destroy();
      await within(closed.promise);
      expect(upstreamRequests).toHaveLength(1);
    } finally {
      request.destroy();
    }
  });

  it('backpressures a paused browser and stops source work when its media stream is cancelled', async () => {
    const closed = deferred();
    const firstBytes = deferred();
    const chunk = Buffer.alloc(64 * 1024, 7);
    const total = 256 * 1024 * 1024;
    let produced = 0;
    upstreamHandler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': String(total) });
      response.once('close', closed.resolve);
      const produce = () => {
        while (!response.destroyed && produced < total) {
          produced += chunk.length;
          if (!response.write(chunk)) {
            response.once('drain', produce);
            return;
          }
        }
        if (produced === total) response.end();
      };
      produce();
    };
    let browser;
    const request = httpRequest(`${relayUrl}${mediaPath()}`, response => {
      browser = response;
      response.once('data', () => {
        response.pause();
        firstBytes.resolve();
      });
      response.on('error', () => {});
    });
    request.on('error', () => {});
    request.end();
    try {
      await within(firstBytes.promise);
      expect(produced).toBeLessThan(total);
      browser.destroy();
      request.destroy();
      await within(closed.promise);
      expect(produced).toBeLessThan(total);
    } finally {
      browser?.destroy();
      request.destroy();
    }
  });
});
