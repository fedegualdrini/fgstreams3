import { createDecipheriv } from 'node:crypto';
import { EMBED_ST_MAX_RESPONSE_BYTES, EMBED_ST_MAX_URL_LENGTH } from './constants';
import { embedStManifestPath } from './embedSt';

/** Only this provider's signed playlists may be fetched by the manifest proxy. */
export function parseEmbedStManifestUrl(input: string): URL {
  const url = new URL(input);
  if (
    input.length > EMBED_ST_MAX_URL_LENGTH || url.protocol !== 'https:' ||
    !/^lb\d+\.strmd\.st$/.test(url.hostname) || url.port ||
    url.username || url.password || url.hash ||
    !url.pathname.startsWith('/secure/') || !url.pathname.endsWith('.m3u8')
  ) {
    throw new Error('Unsupported stream manifest URL.');
  }
  return url;
}

/** Decode the captured protocol, including its authentication tag; never execute provider JS. */
export function decodeEmbedStResponse(body: Uint8Array, header: string | null): string {
  if (!header || Buffer.byteLength(header, 'utf8') !== 32) {
    throw new Error('Missing or invalid stream response key.');
  }
  if (body.length < 2 || body.length > EMBED_ST_MAX_RESPONSE_BYTES || body[0] !== 10) {
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
  return parseEmbedStManifestUrl(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)).href;
}

/** Apply a variant to a newly resolved signature without allowing another stream or origin. */
export function resolveEmbedStVariant(rootUrl: string, variant: string | null): string {
  const root = parseEmbedStManifestUrl(rootUrl);
  const target = parseEmbedStManifestUrl(new URL(variant || root.href, root).href);
  if (target.origin !== root.origin || !target.pathname.startsWith(new URL('.', root).pathname)) {
    throw new Error('Variant is outside the resolved stream.');
  }
  return target.href;
}

const DIRECT_MEDIA_ORIGINS: Record<string, true> = {
  'https://p16-common-sign.tiktokcdn.com': true,
  'https://p19-common-sign.tiktokcdn.com': true,
};
const MEDIA_REDIRECT_STATUSES = [301, 302, 303, 307, 308];

/** Expose one rendition so automatic quality changes cannot enter the restricted low CDN. */
function highestBandwidthOnly(lines: string[]): string[] {
  let selected = -1;
  let highestBandwidth = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    let bandwidth = 0;
    // Quoted attribute values can contain commas and text resembling another attribute.
    for (const attribute of line.slice(18).matchAll(/(?:^|,)([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) {
      if (attribute[1] === 'BANDWIDTH') {
        bandwidth = Number(attribute[2]);
        break;
      }
    }
    if (!Number.isFinite(bandwidth) || bandwidth <= 0) throw new Error('Missing stream bandwidth.');
    if (bandwidth > highestBandwidth) {
      highestBandwidth = bandwidth;
      selected = index;
    }
  }
  if (selected === -1) return lines;
  const result: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim().startsWith('#EXT-X-STREAM-INF:')) {
      result.push(line);
      continue;
    }
    const tagIndex = index;
    while (++index < lines.length && !lines[index].trim()) { /* Skip blank lines before the URI. */ }
    if (index === lines.length || lines[index].trim().startsWith('#')) {
      throw new Error('Missing stream playlist URI.');
    }
    if (tagIndex === selected) result.push(line, lines[index]);
  }
  return result;
}

/** Renew playlists and resolve restricted media redirects; video bytes stay direct. */
export async function rewriteEmbedStManifest(
  text: string, baseUrl: string, rootUrl: string, embedUrl: string,
  resolveMediaRedirect: (url: string) => Promise<{ status: number; location: string | null }>,
): Promise<string> {
  const base = resolveEmbedStVariant(rootUrl, baseUrl);
  const streamDirectory = new URL('.', rootUrl).pathname;
  if (!text.startsWith('#EXTM3U')) throw new Error('Upstream did not return an HLS manifest.');
  const resolve = async (input: string): Promise<string> => {
    const url = new URL(input, base);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Unsupported manifest resource URL.');
    }
    if (!url.pathname.endsWith('.m3u8')) {
      if (DIRECT_MEDIA_ORIGINS[url.origin]) return url.href;
      if (!/^lb\d+\.strmd\.st$/.test(url.hostname) || url.port || !url.pathname.startsWith('/b/')) {
        throw new Error('Unsupported direct media origin.');
      }
      const redirect = await resolveMediaRedirect(url.href);
      if (!MEDIA_REDIRECT_STATUSES.includes(redirect.status) || !redirect.location) {
        throw new Error('The media host did not return a supported redirect.');
      }
      const destination = new URL(redirect.location, url);
      if (destination.protocol !== 'https:' || !DIRECT_MEDIA_ORIGINS[destination.origin] || destination.username || destination.password) {
        throw new Error('Unsupported direct media destination.');
      }
      return destination.href;
    }
    const variant = new URL(resolveEmbedStVariant(rootUrl, url.href));
    return embedStManifestPath(embedUrl, variant.pathname.slice(streamDirectory.length) + variant.search);
  };
  const result: string[] = [];
  // Keep header lookups sequential: a long playlist must not fan out unbounded requests.
  for (const line of highestBandwidthOnly(text.split('\n'))) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push(line);
    } else if (trimmed.startsWith('#')) {
      let rewritten = '';
      let offset = 0;
      for (const match of line.matchAll(/URI="([^"]+)"/g)) {
        rewritten += line.slice(offset, match.index) + `URI="${await resolve(match[1])}"`;
        offset = match.index! + match[0].length;
      }
      result.push(rewritten + line.slice(offset));
    } else {
      result.push(await resolve(trimmed));
    }
  }
  return result.join('\n');
}
