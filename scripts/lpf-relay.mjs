import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const UPSTREAM_TIMEOUT_MS = 30_000;
const HLS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};
const HLS_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'content-encoding',
];

function validateConfig(config) {
  if (!config || typeof config.token !== 'string' || !/^[a-f\d]{64}$/i.test(config.token)) {
    throw new Error('LPF relay requires a 64-character hexadecimal token.');
  }
  if (typeof config.hlsProxySecret !== 'string' || !/^[a-f\d]{64}$/i.test(config.hlsProxySecret)) {
    throw new Error('LPF relay requires a 64-character hexadecimal HLS proxy secret.');
  }
  for (const port of [config.appPort, config.relayPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('LPF relay ports must be integers from 1 to 65535.');
    }
  }
  if (config.appPort === config.relayPort) {
    throw new Error('LPF relay and app ports must differ.');
  }
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function isSnapshot(value) {
  return value !== null && typeof value === 'object'
    && value.channel !== null && typeof value.channel === 'object'
    && Array.isArray(value.channel.options)
    && Number.isFinite(value.checkedAt)
    && (value.error === undefined || typeof value.error === 'string');
}

function relayMedia(request, response, url, config) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { ...HLS_CORS_HEADERS, 'Cache-Control': 'no-store' });
    response.end();
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Method not allowed.' }, {
      ...HLS_CORS_HEADERS,
      Allow: 'GET, HEAD, OPTIONS',
    });
    return;
  }

  const target = url.searchParams.get('url');
  const signature = url.searchParams.get('sig');
  const expected = target
    ? createHmac('sha256', config.hlsProxySecret).update(target).digest().subarray(0, 16)
    : null;
  if (!expected || url.searchParams.getAll('url').length !== 1
    || url.searchParams.getAll('sig').length !== 1 || !/^[a-f\d]{32}$/.test(signature ?? '')
    || !timingSafeEqual(Buffer.from(signature, 'hex'), expected)) {
    sendJson(response, 401, { error: 'Unauthorized.' }, HLS_CORS_HEADERS);
    return;
  }

  const headers = { 'Accept-Encoding': 'identity' };
  if (request.headers.range) headers.Range = request.headers.range;
  const upstream = httpRequest({
    hostname: HOST,
    port: config.appPort,
    path: `/api/hls-proxy?${new URLSearchParams({ url: target, sig: signature })}`,
    method: request.method,
    headers,
  });
  const disconnect = () => upstream.destroy();
  const fail = () => {
    if (response.destroyed) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    sendJson(response, 502, { error: 'Media relay unavailable.' }, HLS_CORS_HEADERS);
  };
  response.once('close', disconnect);
  upstream.once('error', fail);
  upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => upstream.destroy(new Error('Media upstream timeout.')));
  upstream.once('response', media => {
    if (response.destroyed) {
      media.destroy();
      return;
    }
    // Never follow or expose a local redirect to a private endpoint.
    if (media.statusCode >= 300 && media.statusCode < 400 && media.statusCode !== 304) {
      media.destroy();
      fail();
      return;
    }
    const responseHeaders = { ...HLS_CORS_HEADERS, 'Cache-Control': 'no-store' };
    for (const name of HLS_RESPONSE_HEADERS) {
      if (media.headers[name] !== undefined) responseHeaders[name] = media.headers[name];
    }
    // Node's HTTP stream is not decompressed: encoding and length still describe these exact bytes.
    response.writeHead(media.statusCode, responseHeaders);
    pipeline(media, response, () => {});
  });
  upstream.end();
}

export function createLpfRelay(config) {
  validateConfig(config);
  const authorization = Buffer.from(`Bearer ${config.token}`);
  const upstreamUrl = `http://${HOST}:${config.appPort}/api/channels/lpf`;

  return createServer(async (request, response) => {
    if (request.url?.startsWith('/hls-proxy?') || request.url === '/hls-proxy') {
      relayMedia(request, response, new URL(request.url, `http://${HOST}`), config);
      return;
    }
    if (request.url !== '/lpf') {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
      return;
    }
    const supplied = Buffer.from(request.headers.authorization ?? '');
    if (supplied.length !== authorization.length || !timingSafeEqual(supplied, authorization)) {
      sendJson(response, 401, { error: 'Unauthorized.' });
      return;
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (upstream.status !== 200) {
        await upstream.body?.cancel();
        throw new Error('Local LPF API failed.');
      }
      const snapshot = await upstream.json();
      if (!isSnapshot(snapshot)) throw new Error('Invalid LPF snapshot.');
      sendJson(response, 200, snapshot);
    } catch {
      sendJson(response, 502, { error: 'LPF relay unavailable.' });
    }
  });
}

async function main() {
  const config = JSON.parse(await readFile(new URL('../.vercel/lpf-relay.json', import.meta.url), 'utf8'));
  const server = createLpfRelay(config);
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(config.relayPort, HOST, resolveListening);
  });
  console.log(`LPF relay listening on http://${HOST}:${config.relayPort}/lpf`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('LPF relay could not start. Check the private config and loopback ports.');
    process.exitCode = 1;
  });
}
