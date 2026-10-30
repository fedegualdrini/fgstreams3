import { parseStreamFreeEmbedUrl, streamFreeManifestPath } from './streamfreeDirect';

const MAX_HTML_BYTES = 512 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_URL_LENGTH = 2048;
const AUTH_FIELDS = ['_t', '_e', '_n'] as const;
const PROVIDER_ORIGINS: Record<string, true> = { 'https://strmfree.st': true, 'https://streamfree.top': true };
const MEDIA_ORIGIN = 'https://p16-oec-general-useast5.ttcdn-us.com';

type Signature = { _t: string; _e: number; _n: string };
export type StreamFreeEmbedData = { key: string; quality: string; suffix: string; variant: string; signature: Signature };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function signingFields(value: unknown, now: number): Signature {
  if (!record(value) || typeof value._t !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value._t) ||
      typeof value._n !== 'string' || !/^[a-f0-9]{16}$/.test(value._n) ||
      !Number.isSafeInteger(value._e) || (value._e as number) <= Math.floor(now / 1000)) {
    throw new Error('Invalid or expired StreamFree signing metadata.');
  }
  return { _t: value._t, _e: value._e as number, _n: value._n };
}

function oneMatch(text: string, pattern: RegExp): RegExpExecArray {
  const match = pattern.exec(text);
  if (!match || pattern.exec(text)) throw new Error('Unsupported StreamFree embed constants.');
  return match;
}

/** Read only literal constants and JSON, never execute any provider JavaScript. */
export function parseStreamFreeEmbed(html: string, embedUrl: string, now = Date.now()): StreamFreeEmbedData {
  const embed = parseStreamFreeEmbedUrl(embedUrl);
  if (html.length > MAX_HTML_BYTES) throw new Error('StreamFree embed exceeds the size limit.');
  const quality = oneMatch(html, /\bconst\s+QUALITY\s*=\s*(['"])(540p|720p|1080p|2160p)\1\s*;/g)[2];
  const suffix = oneMatch(html, /\bconst\s+SOURCE_SUFFIX\s*=\s*(['"])([1-9][0-9]?)?\1\s*;/g)[2] ?? '';
  const key = oneMatch(html, /\bconst\s+VARIANT\s*=\s*(['"])([a-z0-9]+(?:-[a-z0-9]+)*)\1\s*\+\s*QUALITY\s*\+\s*SOURCE_SUFFIX\s*;/g)[2];
  const variant = key + quality + suffix;
  const requested = embed.pathname.replace(/\/$/, '').split('/').pop();
  // Bare API embeds select the provider's default source, not an arbitrary alternate.
  if (requested !== variant && !(requested === key && suffix === '')) {
    throw new Error('StreamFree embed constants do not match the requested stream.');
  }
  const start = oneMatch(html, /\bconst\s+_0x\s*=\s*(?=\{)/g);
  const offset = start.index + start[0].length;
  // JSON can contain nested objects and quoted braces. Bound the scan before parsing.
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let end = -1;
  for (let index = offset; index < Math.min(html.length, offset + MAX_METADATA_BYTES); index++) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      end = index + 1;
      break;
    }
  }
  if (end === -1 || !/^\s*;/.test(html.slice(end, end + 32))) {
    throw new Error('Unsupported StreamFree signing metadata.');
  }
  const signatures: unknown = JSON.parse(html.slice(offset, end));
  if (!record(signatures) || !Object.hasOwn(signatures, quality)) {
    throw new Error('Missing StreamFree quality signature.');
  }
  return { key, quality, suffix, variant, signature: signingFields(signatures[quality], now) };
}

/** Metadata selects a known route, never a new host or a provider-supplied URL. */
export function streamFreeRootManifest(embedUrl: string, data: StreamFreeEmbedData, metadata: unknown): string {
  const embed = parseStreamFreeEmbedUrl(embedUrl);
  if (!record(metadata) || metadata.stream_key !== data.key || metadata.is_external !== false) {
    throw new Error('Unsupported StreamFree external or mismatched stream.');
  }
  const server = metadata.server_name ?? 'origin';
  if (typeof server !== 'string' || !/^[a-z0-9-]{1,64}$/.test(server)) {
    throw new Error('Unsupported StreamFree server metadata.');
  }
  const route = server === 'externalcdn' ? 'live-externalcdn' : server === 'origin' ? 'live' : 'live-cdn';
  const root = new URL(`/${route}/${data.variant}/index.m3u8`, embed);
  for (const field of AUTH_FIELDS) root.searchParams.set(field, String(data.signature[field]));
  return root.href;
}

/** Only stream-relative playlist names may cross the public manifest route boundary. */
export function validateStreamFreeVariant(variant: string | null): string | null {
  if (variant === null) return null;
  if (variant.length > MAX_URL_LENGTH || /[\x00-\x20\x7f\\#]/.test(variant) || !/^[A-Za-z0-9_-][A-Za-z0-9_./-]*\.m3u8(?:\?[^#\s\\]*)?$/.test(variant)) {
    throw new Error('Unsupported StreamFree variant.');
  }
  const [path] = variant.split('?');
  if (path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsupported StreamFree variant.');
  }
  const url = new URL(variant, 'https://variant.invalid/');
  for (const [key, value] of url.searchParams) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key) || value.length > 512 || /[\x00-\x20\x7f]/.test(value)) {
      throw new Error('Unsupported StreamFree variant query.');
    }
  }
  for (const field of AUTH_FIELDS) url.searchParams.delete(field);
  return url.pathname.slice(1) + url.search;
}

function parseRoot(rootUrl: string): URL {
  const root = new URL(rootUrl);
  if (!PROVIDER_ORIGINS[root.origin] || root.username || root.password || root.hash ||
      !/^\/(?:live|live-cdn|live-externalcdn)\/[a-z0-9-]+\/index\.m3u8$/.test(root.pathname)) {
    throw new Error('Unsupported StreamFree manifest origin.');
  }
  return root;
}

/** Reapply a newly resolved signature, rather than retaining expired nested tokens. */
export function resolveStreamFreeVariant(rootUrl: string, variant: string | null): string {
  const root = parseRoot(rootUrl);
  const relative = validateStreamFreeVariant(variant);
  const target = relative === null ? new URL(root) : new URL(relative, root);
  for (const field of AUTH_FIELDS) target.searchParams.set(field, root.searchParams.get(field) ?? '');
  return target.href;
}

function safeResource(input: string, base: URL): URL {
  if (input.length > MAX_URL_LENGTH || /[\x00-\x20\x7f\\]/.test(input)) {
    throw new Error('Unsupported StreamFree resource URL.');
  }
  const url = new URL(input, base);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    throw new Error('Unsupported StreamFree resource URL.');
  }
  return url;
}

/** Rewrite playlists only. Vetted media URLs remain browser-direct; no media is fetched. */
export function rewriteStreamFreeManifest(text: string, baseUrl: string, rootUrl: string, embedUrl: string): string {
  if (text.length > MAX_MANIFEST_BYTES || !/^#EXTM3U(?:\r?\n|$)/.test(text)) {
    throw new Error('The provider did not return a supported HLS manifest.');
  }
  const root = parseRoot(rootUrl);
  const directory = new URL('.', root).pathname;
  const base = safeResource(baseUrl, root);
  if (base.origin !== root.origin || !base.pathname.startsWith(directory)) {
    throw new Error('StreamFree playlist is outside the resolved stream.');
  }
  const resolve = (input: string): string => {
    const url = safeResource(input, base);
    if (url.pathname.endsWith('.m3u8')) {
      if (url.origin !== root.origin || !url.pathname.startsWith(directory) || /%/.test(url.pathname)) {
        throw new Error('StreamFree playlist is outside the resolved stream.');
      }
      const relative = validateStreamFreeVariant(url.pathname.slice(directory.length) + url.search)!;
      return streamFreeManifestPath(embedUrl, relative);
    }
    if (url.origin !== MEDIA_ORIGIN || !/^\/obj\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(url.pathname) ||
        url.pathname.split('/').some(part => part === '.' || part === '..')) {
      throw new Error('Unsupported StreamFree direct media URL.');
    }
    return url.href;
  };
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (!trimmed.startsWith('#')) return resolve(trimmed);
    // Steering and variable substitution introduce fetch targets outside this vetted protocol.
    if (/^#EXT-X-(?:CONTENT-STEERING|DEFINE):/.test(trimmed)) {
      throw new Error('Unsupported StreamFree HLS extension.');
    }
    const colon = line.indexOf(':');
    if (colon === -1) return line;
    const attributes = line.slice(colon + 1);
    let result = '';
    let offset = 0;
    // Parse whole quoted values so commas or URI-like text inside NAME cannot bypass validation.
    const pattern = /(?:^|,)\s*([A-Za-z0-9-]+)\s*=\s*("[^"\r\n]*"|[^,]*)/g;
    for (const match of attributes.matchAll(pattern)) {
      const name = match[1];
      if (name.toUpperCase() === 'X-ASSET-LIST') throw new Error('Unsupported StreamFree interstitial resource.');
      if (!/(?:URI|URL)$/i.test(name)) continue;
      if (name !== 'URI' || !/^"[^"\r\n]+"$/.test(match[2])) {
        throw new Error('Unsupported StreamFree HLS resource attribute.');
      }
      const valueStart = colon + 1 + match.index! + match[0].length - match[2].length;
      result += line.slice(offset, valueStart) + `"${resolve(match[2].slice(1, -1))}"`;
      offset = valueStart + match[2].length;
    }
    return result + line.slice(offset);
  }).join('\n');
}

async function readBounded(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new Error('Empty StreamFree response.');
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel();
    throw new Error('StreamFree response exceeds the size limit.');
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('StreamFree response exceeds the size limit.');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** One bounded resolution per request; neither signed playlists nor metadata are cached. */
export async function loadStreamFreeManifest(embedUrl: string, variant: string | null, signal: AbortSignal): Promise<string> {
  const embed = parseStreamFreeEmbedUrl(embedUrl);
  validateStreamFreeVariant(variant);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  const fetchText = async (url: string, maxBytes: number): Promise<string> => {
    deadline.throwIfAborted();
    const response = await fetch(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline,
    });
    if (!response.ok || response.redirected || (response.url && response.url !== url)) {
      await response.body?.cancel();
      throw new Error('StreamFree upstream request failed.');
    }
    return readBounded(response, maxBytes, deadline);
  };
  const data = parseStreamFreeEmbed(await fetchText(embed.href, MAX_HTML_BYTES), embed.href);
  const metadata: unknown = JSON.parse(await fetchText(new URL(`/get-stream-key/${data.key}`, embed).href, MAX_METADATA_BYTES));
  const root = streamFreeRootManifest(embed.href, data, metadata);
  const target = resolveStreamFreeVariant(root, variant);
  return rewriteStreamFreeManifest(await fetchText(target, MAX_MANIFEST_BYTES), target, root, embed.href);
}
