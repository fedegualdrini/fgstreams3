// @vitest-environment node
import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EMBED_ST_MAX_RESPONSE_BYTES } from './constants';
import { encodeEmbedStRequest, embedStManifestPath } from './embedSt';
import {
  decodeEmbedStResponse,
  parseEmbedStManifestUrl,
  rewriteEmbedStManifest,
  resolveEmbedStVariant,
} from './embedStServer';

const key = '0123456789abcdefghijklmnopqrstuv';
const playlist = 'https://lb27.strmd.st/secure/test-token/rtmp/stream/test/1/playlist.m3u8';
const embed = 'https://embed.st/embed/admin/example-stream/1';

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
    const request = encodeEmbedStRequest(`https://embed.st/embed/admin/${id}/12`);
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
    expect(() => encodeEmbedStRequest(input)).toThrow();
  });
});

describe('authenticated response decoding', () => {
  it('authenticates and decodes the protobuf, rotated base64 and ChaCha20-Poly1305 packet', () => {
    expect(decodeEmbedStResponse(responseFor(), key)).toBe(playlist);
  });

  it('rejects wrong keys and tampered tags instead of returning unauthenticated URLs', () => {
    expect(() => decodeEmbedStResponse(responseFor(), null)).toThrow();
    expect(() => decodeEmbedStResponse(responseFor(), 'z'.repeat(32))).toThrow();
    expect(() => decodeEmbedStResponse(responseFor(playlist, true), key)).toThrow();
  });

  it('rejects truncated, oversized and malformed protobuf envelopes', () => {
    const valid = responseFor();
    expect(() => decodeEmbedStResponse(valid.subarray(0, -1), key)).toThrow();
    expect(() => decodeEmbedStResponse(new Uint8Array(EMBED_ST_MAX_RESPONSE_BYTES + 1), key)).toThrow();
    expect(() => decodeEmbedStResponse(new Uint8Array([10, 128, 128, 128, 128, 128, 0]), key)).toThrow();
    expect(() => decodeEmbedStResponse(new Uint8Array([10, 1, 255]), key)).toThrow();
  });

  it('rejects authenticated plaintext outside the supported playlist origin', () => {
    expect(() => decodeEmbedStResponse(responseFor('https://127.0.0.1/private.m3u8'), key)).toThrow();
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
    expect(() => parseEmbedStManifestUrl(url)).toThrow();
  });

  it('proxies relative variants and alternate audio playlists while keeping CDN segments direct', () => {
    const manifest = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8\nhttps://cdn.example/segment.webp\n';
    expect(rewriteEmbedStManifest(manifest, playlist, playlist, embed)).toBe([
      '#EXTM3U',
      `#EXT-X-MEDIA:TYPE=AUDIO,URI="${embedStManifestPath(embed, 'audio.m3u8')}"`,
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000',
      embedStManifestPath(embed, 'video.m3u8'),
      'https://cdn.example/segment.webp',
      '',
    ].join('\n'));
  });

  it('carries a relative variant across renewed signatures instead of reusing the old signed URL', () => {
    const rewritten = rewriteEmbedStManifest('#EXTM3U\nhigh/mono.m3u8', playlist, playlist, embed);
    const proxy = new URL(rewritten.split('\n')[1], 'https://app.example');
    const renewed = 'https://lb99.strmd.st/secure/new-token/rtmp/stream/new-session/1/playlist.m3u8';
    expect(proxy.searchParams.get('embed')).toBe(embed);
    expect(resolveEmbedStVariant(renewed, proxy.searchParams.get('variant'))).toBe(
      'https://lb99.strmd.st/secure/new-token/rtmp/stream/new-session/1/high/mono.m3u8',
    );
  });

  it('resolves nested playlist references relative to the fetched level but confines them to the stream root', () => {
    const high = new URL('high/mono.m3u8', playlist).href;
    expect(rewriteEmbedStManifest('#EXTM3U\n../low/mono.m3u8', high, playlist, embed)).toBe(
      `#EXTM3U\n${embedStManifestPath(embed, 'low/mono.m3u8')}`,
    );
  });

  it.each([
    '../../other/playlist.m3u8',
    '/secure/other/playlist.m3u8',
    'https://lb99.strmd.st/secure/test-token/rtmp/stream/test/1/high.m3u8',
    'https://127.0.0.1/secure/private.m3u8',
    'http://lb27.strmd.st/secure/test-token/rtmp/stream/test/1/high.m3u8',
  ])('rejects variants outside the newly resolved stream: %s', variant => {
    expect(() => resolveEmbedStVariant(playlist, variant)).toThrow();
  });

  it('does not treat HTML errors or unsafe resource schemes as playable manifests', () => {
    expect(() => rewriteEmbedStManifest('<html>Forbidden</html>', playlist, playlist, embed)).toThrow();
    expect(() => rewriteEmbedStManifest('#EXTM3U\nhttp://127.0.0.1/private.ts', playlist, playlist, embed)).toThrow();
    expect(() => rewriteEmbedStManifest('#EXTM3U\nhttps://other.example/master.m3u8', playlist, playlist, embed)).toThrow();
  });
});
