import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const UPSTREAM_TIMEOUT_MS = 30_000;

function validateConfig(config) {
  if (!config || typeof config.token !== 'string' || !/^[a-f\d]{64}$/i.test(config.token)) {
    throw new Error('LPF relay requires a 64-character hexadecimal token.');
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

export function createLpfRelay(config) {
  validateConfig(config);
  const authorization = Buffer.from(`Bearer ${config.token}`);
  const upstreamUrl = `http://${HOST}:${config.appPort}/api/channels/lpf`;

  return createServer(async (request, response) => {
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
