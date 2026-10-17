// @vitest-environment node
import { createCipheriv } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
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
const directMedia = 'https://p16-common-sign.tiktokcdn.com/segment.image?x-signature=abc%2Fdef';
const noMediaRedirect = async () => ({ status: 403, location: null });

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

  it('proxies relative variants and alternate audio playlists', async () => {
    const manifest = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8\n';
    expect(await rewriteEmbedStManifest(manifest, playlist, playlist, embed, noMediaRedirect)).toBe([
      '#EXTM3U',
      `#EXT-X-MEDIA:TYPE=AUDIO,URI="${embedStManifestPath(embed, 'audio.m3u8')}"`,
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000',
      embedStManifestPath(embed, 'video.m3u8'),
      '',
    ].join('\n'));
  });

  it('advertises only the highest-bandwidth rendition, not the first or last alternative', async () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-INDEPENDENT-SEGMENTS',
      '#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=960x540',
      'low/mono.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080',
      'high/mono.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720',
      'medium/mono.m3u8',
    ].join('\n');
    const rewritten = await rewriteEmbedStManifest(manifest, playlist, playlist, embed, noMediaRedirect);
    expect(rewritten.split('\n').filter(line => line.startsWith('#EXT-X-STREAM-INF:'))).toEqual([
      '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080',
    ]);
    expect(rewritten.split('\n').filter(line => line && !line.startsWith('#'))).toEqual([
      embedStManifestPath(embed, 'high/mono.m3u8'),
    ]);
    expect(rewritten).toContain('#EXT-X-INDEPENDENT-SEGMENTS');
  });

  it('ranks by BANDWIDTH, not AVERAGE-BANDWIDTH or attribute-like text inside a quoted name', async () => {
    const manifest = '#EXTM3U\n#EXT-X-STREAM-INF:NAME="low,BANDWIDTH=99000000,extra",AVERAGE-BANDWIDTH=90000000,BANDWIDTH=700000\nlow/mono.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\nhigh/mono.m3u8';
    const rewritten = await rewriteEmbedStManifest(manifest, playlist, playlist, embed, noMediaRedirect);
    expect(rewritten.split('\n').filter(line => line && !line.startsWith('#'))).toEqual([
      embedStManifestPath(embed, 'high/mono.m3u8'),
    ]);
  });

  it('keeps signed media URLs intact on the verified direct CDNs', async () => {
    const urls = [
      'https://p16-common-sign.tiktokcdn.com/video-a.webp?x-expires=123&x-signature=abc%2Fdef',
      'https://p19-common-sign.tiktokcdn.com/video-b.webp?x-expires=456&x-signature=ghi%2Bjkl',
    ];
    const manifest = `#EXTM3U\n#EXTINF:5,\n${urls[0]}\n#EXTINF:5,\n${urls[1]}\n`;
    const rewritten = await rewriteEmbedStManifest(manifest, playlist, playlist, embed, noMediaRedirect);
    expect(rewritten.split('\n').filter(line => line && !line.startsWith('#'))).toEqual(urls);
  });

  it.each([
    'https://lb19.strmd.st.evil.example/b/segment.ts',
    'https://lb19.strmd.st/secure/private.ts',
    'https://127.0.0.1/b/segment.ts',
    'https://user@lb19.strmd.st/b/segment.ts',
    'https://lb19.strmd.st:444/b/segment.ts',
    'https://unverified.example/segment.ts',
    'https://p16-common-sign.tiktokcdn.com.evil.example/segment.webp',
    'https://p16-common-sign.tiktokcdn.com:444/segment.webp',
  ])('does not resolve or expose media on an unsupported origin or path: %s', async url => {
    const resolve = vi.fn(async () => ({ status: 302, location: directMedia }));
    await expect(rewriteEmbedStManifest(`#EXTM3U\n#EXTINF:5,\n${url}`, playlist, playlist, embed, resolve)).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('also checks indirect media resources in URI attributes', async () => {
    const manifest = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://lb19.strmd.st/b/stream/key"\n';
    await expect(rewriteEmbedStManifest(manifest, playlist, playlist, embed, noMediaRedirect)).rejects.toThrow();
  });

  it('rejects an incomplete rendition instead of exposing an unranked or missing playlist', async () => {
    await expect(rewriteEmbedStManifest('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nhigh/mono.m3u8', playlist, playlist, embed, noMediaRedirect)).rejects.toThrow();
    await expect(rewriteEmbedStManifest('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\n', playlist, playlist, embed, noMediaRedirect)).rejects.toThrow();
  });

  it('carries a relative variant across renewed signatures instead of reusing the old signed URL', async () => {
    const rewritten = await rewriteEmbedStManifest('#EXTM3U\nhigh/mono.m3u8', playlist, playlist, embed, noMediaRedirect);
    const proxy = new URL(rewritten.split('\n')[1], 'https://app.example');
    const renewed = 'https://lb99.strmd.st/secure/new-token/rtmp/stream/new-session/1/playlist.m3u8';
    expect(proxy.searchParams.get('embed')).toBe(embed);
    expect(resolveEmbedStVariant(renewed, proxy.searchParams.get('variant'))).toBe(
      'https://lb99.strmd.st/secure/new-token/rtmp/stream/new-session/1/high/mono.m3u8',
    );
  });

  it('resolves nested playlist references relative to the fetched level but confines them to the stream root', async () => {
    const high = new URL('high/mono.m3u8', playlist).href;
    expect(await rewriteEmbedStManifest('#EXTM3U\n../low/mono.m3u8', high, playlist, embed, noMediaRedirect)).toBe(`#EXTM3U\n${embedStManifestPath(embed, 'low/mono.m3u8')}`);
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

  it('replaces restricted media references and URI attributes with validated direct CDN destinations', async () => {
    const key = 'https://p19-common-sign.tiktokcdn.com/key.image?x-signature=key%2Bvalue';
    const manifest = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="/b/stream/key"\n#EXTINF:6,\nhttps://lb19.strmd.st/b/stream/segment.ts\n';
    const rewritten = await rewriteEmbedStManifest(manifest, playlist, playlist, embed,
      async url => ({ status: 302, location: url.endsWith('/key') ? key : directMedia }));
    expect(rewritten).toContain(`URI="${key}"`);
    expect(rewritten.split('\n').filter(line => line && !line.startsWith('#'))).toEqual([directMedia]);
    expect(rewritten).not.toContain('strmd.st');
  });

  it.each([
    'https://unverified.example/video.ts',
    'https://p16-common-sign.tiktokcdn.com.evil.example/video.ts',
    'http://p16-common-sign.tiktokcdn.com/video.ts',
    'https://p16-common-sign.tiktokcdn.com:444/video.ts',
    'https://user@p16-common-sign.tiktokcdn.com/video.ts',
    'https://127.0.0.1/video.ts',
    '/b/another-hop/segment.ts',
  ])('rejects a media redirect outside the verified direct origins: %s', async location => {
    const manifest = '#EXTM3U\n#EXTINF:6,\nhttps://lb19.strmd.st/b/stream/segment.ts';
    await expect(rewriteEmbedStManifest(manifest, playlist, playlist, embed,
      async () => ({ status: 302, location }))).rejects.toThrow();
  });

  it.each([
    { status: 302, location: null },
    { status: 200, location: directMedia },
    { status: 403, location: directMedia },
    { status: 304, location: directMedia },
  ])('does not emit restricted media when redirect resolution fails: $status', async redirect => {
    const manifest = '#EXTM3U\n#EXTINF:6,\nhttps://lb19.strmd.st/b/stream/segment.ts';
    await expect(rewriteEmbedStManifest(manifest, playlist, playlist, embed,
      async () => redirect)).rejects.toThrow();
  });

  it('does not fall back to a restricted URL when its header request fails', async () => {
    const manifest = '#EXTM3U\n#EXTINF:6,\nhttps://lb19.strmd.st/b/stream/segment.ts';
    await expect(rewriteEmbedStManifest(manifest, playlist, playlist, embed,
      async () => { throw new Error('Connection failed'); })).rejects.toThrow();
  });

  it('does not treat HTML errors or unsafe resource schemes as playable manifests', async () => {
    await expect(rewriteEmbedStManifest('<html>Forbidden</html>', playlist, playlist, embed, noMediaRedirect)).rejects.toThrow();
    await expect(rewriteEmbedStManifest('#EXTM3U\nhttp://127.0.0.1/private.ts', playlist, playlist, embed, noMediaRedirect)).rejects.toThrow();
    await expect(rewriteEmbedStManifest('#EXTM3U\nhttps://other.example/master.m3u8', playlist, playlist, embed, noMediaRedirect)).rejects.toThrow();
  });
});
