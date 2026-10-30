// @vitest-environment node

import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLpfRelay } from './lpf-relay.mjs';

const TOKEN = '8a4e6c09d2b7f135'.repeat(4);
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

const validConfig = { token: TOKEN, appPort: 3100, relayPort: 3101 };

describe('LPF relay configuration', () => {
  it.each([undefined, '', 'secret', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])(
    'rejects a missing or malformed private token (%s)',
    token => {
      expect(() => createLpfRelay({ ...validConfig, token })).toThrow();
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

describe('LPF relay HTTP boundary', () => {
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
});
