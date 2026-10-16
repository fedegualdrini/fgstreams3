// @vitest-environment node
import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { STREAM_TEST_MAX_RESPONSE_BYTES } from './constants';
import { encodeStreamTestRequest } from './streamTest';
import {
  decodeStreamTestResponse,
  parseStreamTestManifestUrl,
  readStreamTestResponse,
  rewriteStreamTestManifest,
  streamTestManifestPath,
} from './streamTestServer';

const key = '0123456789abcdefghijklmnopqrstuv';
const playlist = 'https://lb27.strmd.st/secure/test-token/rtmp/stream/test/1/playlist.m3u8';

function responseFor(url = playlist, corruptTag = false): Uint8Array {
  const nonce = Buffer.alloc(12, 7);
  const cipher = createCipheriv('chacha20-poly1305', Buffer.from(key), nonce, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (corruptTag) tag[0] ^= 1;
  const base64 = Buffer.concat([nonce, encrypted, tag]).toString('base64');
  const rotated = Buffer.from(Array.from(base64, c => String.fromCharCode(33 + (c.charCodeAt(0) - 33 + 23) % 94)).join(''), 'ascii');
  const prefix = [10];
  let length = rotated.length;
  while (length >= 128) {
    prefix.push((length & 127) | 128);
    length >>>= 7;
  }
  return Buffer.concat([Buffer.from([...prefix, length]), rotated]);
}

describe('stream request encoding', () => {
  it('encodes an ID longer than one protobuf length byte without changing the following stream field', () => {
    const id = 'x'.repeat(130);
    const request = encodeStreamTestRequest(`https://embed.st/embed/admin/${id}/12`);
    expect(Array.from(request.subarray(0, 10))).toEqual([10, 5, 97, 100, 109, 105, 110, 18, 130, 1]);
    expect(new TextDecoder().decode(request.subarray(10, 140))).toBe(id);
    expect(Array.from(request.subarray(140))).toEqual([26, 2, 49, 50]);
  });

  it.each([
    'http://embed.st/embed/admin/id/1',
    'https://embed.st.evil.example/embed/admin/id/1',
    'https://user:pass@embed.st/embed/admin/id/1',
    'https://embed.st:444/embed/admin/id/1',
    'https://embed.st/embed/admin/id/0',
    'https://embed.st/embed/admin/id/1?redirect=elsewhere',
    'https://fgstreams3.vercel.app/match/example',
  ])('rejects unsupported embed input %s', input => {
    expect(() => encodeStreamTestRequest(input)).toThrow();
  });
});

describe('authenticated response decoding', () => {
  it('authenticates and decodes the protobuf, rotated base64 and ChaCha20-Poly1305 packet', () => {
    expect(decodeStreamTestResponse(responseFor(), key)).toBe(playlist);
  });

  it('rejects wrong keys and tampered tags instead of returning unauthenticated URLs', () => {
    expect(() => decodeStreamTestResponse(responseFor(), null)).toThrow();
    expect(() => decodeStreamTestResponse(responseFor(), 'z'.repeat(32))).toThrow();
    expect(() => decodeStreamTestResponse(responseFor(playlist, true), key)).toThrow();
  });

  it('rejects truncated, oversized and malformed protobuf envelopes', () => {
    const valid = responseFor();
    expect(() => decodeStreamTestResponse(valid.subarray(0, -1), key)).toThrow();
    expect(() => decodeStreamTestResponse(new Uint8Array(STREAM_TEST_MAX_RESPONSE_BYTES + 1), key)).toThrow();
    expect(() => decodeStreamTestResponse(new Uint8Array([10, 128, 128, 128, 128, 128, 0]), key)).toThrow();
    expect(() => decodeStreamTestResponse(new Uint8Array([10, 1, 255]), key)).toThrow();
  });

  it('rejects authenticated plaintext outside the supported playlist origin', () => {
    expect(() => decodeStreamTestResponse(responseFor('https://127.0.0.1/private.m3u8'), key)).toThrow();
  });
});

describe('manifest proxy boundary', () => {
  it.each([
    'http://lb27.strmd.st/secure/a.m3u8',
    'https://lb27.strmd.st.evil.example/secure/a.m3u8',
    'https://lb27.strmd.st:444/secure/a.m3u8',
    'https://user@lb27.strmd.st/secure/a.m3u8',
    'https://127.0.0.1/secure/a.m3u8',
    'https://lb27.strmd.st/secure/segment.ts',
    'https://lb27.strmd.st/anything/a.m3u8',
  ])('rejects unsupported proxy target %s', url => {
    expect(() => parseStreamTestManifestUrl(url)).toThrow();
  });

  it('proxies relative variants and alternate audio playlists while keeping CDN segments direct', () => {
    const manifest = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8\nhttps://cdn.example/segment.webp\n';
    expect(rewriteStreamTestManifest(manifest, playlist)).toBe([
      '#EXTM3U',
      `#EXT-X-MEDIA:TYPE=AUDIO,URI="${streamTestManifestPath(new URL('audio.m3u8', playlist).href)}"`,
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000',
      streamTestManifestPath(new URL('video.m3u8', playlist).href),
      'https://cdn.example/segment.webp',
      '',
    ].join('\n'));
  });

  it('does not treat HTML errors or unsafe resource schemes as playable manifests', () => {
    expect(() => rewriteStreamTestManifest('<html>Forbidden</html>', playlist)).toThrow();
    expect(() => rewriteStreamTestManifest('#EXTM3U\nhttp://127.0.0.1/private.ts', playlist)).toThrow();
    expect(() => rewriteStreamTestManifest('#EXTM3U\nhttps://other.example/master.m3u8', playlist)).toThrow();
  });
});

describe('decoder request bound', () => {
  it('cancels oversized chunked bodies before buffering the rest', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(STREAM_TEST_MAX_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; },
    });
    const request = new Request('http://localhost/decode', { method: 'POST', body, duplex: 'half' } as RequestInit);
    await expect(readStreamTestResponse(request)).rejects.toThrow('too large');
    expect(cancelled).toBe(true);
  });
});
