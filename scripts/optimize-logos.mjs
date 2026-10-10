#!/usr/bin/env node
// Downloads every remote channel logo once, shrinks it and serves it locally.
//
//   node scripts/optimize-logos.mjs [--dry-run]
//
// public/channels.json points at logos on ~100 third-party hosts, some of them
// multi-megabyte images shown at 36x36 CSS px. This script fetches each distinct
// remote logo, resizes it to fit inside 72x72 (2x for retina), encodes it as
// WebP into public/logos/<sha1(url)>.webp and rewrites the channel's `logo` to
// that local path. Logos that cannot be fetched keep their original URL.
//
// Re-running is safe: a logo whose target file already exists is not downloaded
// again. With --dry-run everything is fetched and reported but nothing is written.
//
// The pure helpers (file naming, JSON rewrite) are exported for tests; the CLI
// only runs when this file is executed directly.

import { createHash } from 'crypto';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const CHANNELS_PATH = path.join(process.cwd(), 'public', 'channels.json');
const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');
const LOGOS_URL_PREFIX = '/logos/';

const MAX_SIZE = 72;
const WEBP_QUALITY = 80;
/** Rasterisation density for SVGs; ignored for bitmap formats. */
const SVG_DENSITY = 300;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const CONCURRENCY = 12;
const ATTEMPTS = 2;
/** Pause before the retry; rate-limited hosts (429) and flaky DNS usually recover in seconds. */
const RETRY_DELAY_MS = 2_000;
const HASH_LENGTH = 12;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const isRemote = value => typeof value === 'string' && /^https?:\/\//.test(value);

/** Stable file name for a logo URL; the full URL (query string included) is hashed. */
export function logoFileName(url) {
  return `${createHash('sha1').update(url).digest('hex').slice(0, HASH_LENGTH)}.webp`;
}

export function distinctRemoteLogos(channels) {
  return [...new Set(channels.map(c => c.logo).filter(isRemote))];
}

/**
 * Point channels at their local logo. `resolved` maps remote URL -> local path,
 * or '' for a logo that is gone for good; remote logos missing from it (transient
 * failures) and non-remote logos are untouched.
 */
export function rewriteLogos(channels, resolved) {
  return channels.map(channel =>
    isRemote(channel.logo) && resolved.has(channel.logo)
      ? { ...channel, logo: resolved.get(channel.logo) }
      : channel
  );
}

/** Serialise exactly like the file on disk: 2-space JSON, same line endings, trailing newline. */
export function serializeLike(original, channels) {
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const trailing = /\r?\n$/.test(original) ? eol : '';
  return JSON.stringify(channels, null, 2).replace(/\n/g, eol) + trailing;
}

/**
 * Where to fetch a logo from: an http:// URL is tried as https:// first, since
 * most hosts serve both and mixed content is flagged. The channel keeps being
 * identified by its original URL, so the file name never depends on this.
 */
export function sourceUrls(url) {
  return url.startsWith('http://') ? [`https://${url.slice('http://'.length)}`, url] : [url];
}

/**
 * Whether a failed download can ever succeed. A gone resource (400/404/410) or a
 * nonexistent domain is permanent; blocks (403), rate limits (429), resets,
 * timeouts and temporary DNS failures are transient and worth retrying later.
 */
export function classifyFailure(err) {
  const permanentStatus = [400, 404, 410].includes(err?.status);
  return permanentStatus || err?.cause?.code === 'ENOTFOUND' ? 'permanent' : 'transient';
}

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Reads the body but gives up as soon as it grows past the cap. */
async function readCapped(response) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`too large (${declared} bytes)`);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > MAX_DOWNLOAD_BYTES) throw new Error('too large (> 15 MB)');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function download(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return readCapped(response);
}

async function downloadWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      return await download(url);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** First frame only (animated GIF/WebP), fitted inside MAX_SIZE, never enlarged. */
function shrink(input) {
  return sharp(input, { density: SVG_DENSITY })
    .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

function errorReason(err) {
  const cause = err?.cause?.code || err?.cause?.message;
  const message = err?.name === 'TimeoutError' ? 'timeout' : err?.message || String(err);
  return cause ? `${message} (${cause})` : message;
}

async function fetchAndShrink(source) {
  const original = await downloadWithRetry(source);
  return { original, optimized: await shrink(original) };
}

/** Fetch, shrink and (unless dry-run) store one logo. Never throws; returns the outcome. */
async function processLogo(url, dryRun) {
  const file = path.join(LOGOS_DIR, logoFileName(url));
  if (await exists(file)) return { url, status: 'skipped' };
  const sources = sourceUrls(url);
  for (const [index, source] of sources.entries()) {
    try {
      const { original, optimized } = await fetchAndShrink(source);
      if (!dryRun) await writeFile(file, optimized);
      return { url, status: 'optimized', before: original.length, after: optimized.length };
    } catch (err) {
      if (index < sources.length - 1) continue;
      return { url, status: 'failed', permanent: classifyFailure(err) === 'permanent', reason: errorReason(err) };
    }
  }
}

async function runPool(items, worker, limit) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      done++;
      if (done % 25 === 0 || done === items.length) {
        process.stderr.write(`\r${done}/${items.length} logos processed`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  process.stderr.write('\n');
  return results;
}

const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function printSummary(results) {
  const count = status => results.filter(r => r.status === status).length;
  const optimized = results.filter(r => r.status === 'optimized');
  const before = optimized.reduce((sum, r) => sum + r.before, 0);
  const after = optimized.reduce((sum, r) => sum + r.after, 0);
  console.log(
    `distinct: ${results.length}, optimized: ${count('optimized')}, ` +
      `skipped (already local): ${count('skipped')}, failed: ${count('failed')}, ` +
      `downloaded ${megabytes(before)} -> written ${megabytes(after)}`
  );

  const failures = results.filter(r => r.status === 'failed');
  for (const [label, permanent] of [['blanked (permanent)', true], ['kept (transient)', false]]) {
    const group = failures.filter(r => r.permanent === permanent);
    const byReason = new Map();
    for (const r of group) byReason.set(r.reason, [...(byReason.get(r.reason) ?? []), r.url]);
    console.log(`\n${label}: ${group.length}`);
    for (const [reason, urls] of byReason) {
      console.log(`  ${reason} (${urls.length})`);
      for (const url of urls) console.log(`    ${url}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const original = await readFile(CHANNELS_PATH, 'utf8');
  const channels = JSON.parse(original);

  const urls = distinctRemoteLogos(channels);
  if (!args.dryRun) await mkdir(LOGOS_DIR, { recursive: true });
  const results = await runPool(urls, url => processLogo(url, args.dryRun), CONCURRENCY);
  printSummary(results);

  if (args.dryRun) {
    console.log('\n(dry run — nothing written)');
    return;
  }
  // Permanently dead logos are blanked so the UI shows initials instead of a broken image.
  const resolved = new Map(
    results
      .filter(r => r.status !== 'failed' || r.permanent)
      .map(r => [r.url, r.status === 'failed' ? '' : LOGOS_URL_PREFIX + logoFileName(r.url)])
  );
  await writeFile(CHANNELS_PATH, serializeLike(original, rewriteLogos(channels, resolved)));
  const blanked = results.filter(r => r.permanent).length;
  console.log(`\nrewrote ${resolved.size - blanked} logos, blanked ${blanked} in ${CHANNELS_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
