import { createDecipheriv } from 'node:crypto';
import { STREAM_TEST_MAX_RESPONSE_BYTES, STREAM_TEST_MAX_URL_LENGTH } from './constants';

/** Only this provider's signed playlists may be fetched by the manifest proxy. */
export function parseStreamTestManifestUrl(input: string): URL {
  const url = new URL(input);
  if (
    input.length > STREAM_TEST_MAX_URL_LENGTH || url.protocol !== 'https:' ||
    !/^lb\d+\.strmd\.st$/.test(url.hostname) || url.port ||
    url.username || url.password || url.hash ||
    !url.pathname.startsWith('/secure/') || !url.pathname.endsWith('.m3u8')
  ) {
    throw new Error('Unsupported stream manifest URL.');
  }
  return url;
}

export function streamTestManifestPath(input: string): string {
  const url = parseStreamTestManifestUrl(input);
  return `/api/stream-test/manifest?url=${encodeURIComponent(url.href)}`;
}

/** Decode the captured protocol, including its authentication tag; never execute provider JS. */
export function decodeStreamTestResponse(body: Uint8Array, header: string | null): string {
  if (!header || Buffer.byteLength(header, 'utf8') !== 32) {
    throw new Error('Missing or invalid stream response key.');
  }
  if (body.length < 2 || body.length > STREAM_TEST_MAX_RESPONSE_BYTES || body[0] !== 10) {
    throw new Error('Invalid stream response envelope.');
  }
  let offset = 1;
  let length = 0;
  let shift = 0;
  let byte: number;
  do {
    if (offset >= body.length || shift >= 35) throw new Error('Invalid stream response length.');
    byte = body[offset++];
    length += (byte & 127) * 2 ** shift;
    shift += 7;
  } while (byte & 128);
  if (offset + length !== body.length) throw new Error('Truncated stream response.');

  const base64 = Array.from(body.subarray(offset), code => {
    if (code < 33 || code > 126) throw new Error('Invalid stream response encoding.');
    return String.fromCharCode(33 + (code - 33 + 94 - 23) % 94);
  }).join('');
  const packet = Buffer.from(base64, 'base64');
  if (packet.length < 28 || packet.toString('base64') !== base64) {
    throw new Error('Invalid stream response encoding.');
  }
  const decipher = createDecipheriv('chacha20-poly1305', Buffer.from(header, 'utf8'), packet.subarray(0, 12), {
    authTagLength: 16,
  });
  decipher.setAuthTag(packet.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(packet.subarray(12, -16)), decipher.final()]);
  return parseStreamTestManifestUrl(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)).href;
}

/** Stop reading as soon as the decoder's bound is exceeded, including chunked requests. */
export async function readStreamTestResponse(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new Error('Missing stream response.');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(STREAM_TEST_MAX_RESPONSE_BYTES);
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return bytes.subarray(0, size);
      if (size + value.length > bytes.length) {
        await reader.cancel();
        throw new Error('Stream response is too large.');
      }
      bytes.set(value, size);
      size += value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Proxy nested playlists only; CDN media segments remain direct browser requests. */
export function rewriteStreamTestManifest(text: string, baseUrl: string): string {
  parseStreamTestManifestUrl(baseUrl);
  if (!text.startsWith('#EXTM3U')) throw new Error('Upstream did not return an HLS manifest.');
  const resolve = (input: string) => {
    const url = new URL(input, baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Unsupported manifest resource URL.');
    }
    return url.pathname.endsWith('.m3u8') ? streamTestManifestPath(url.href) : url.href;
  };
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${resolve(uri)}"`);
    return resolve(trimmed);
  }).join('\n');
}
