#!/usr/bin/env node
// Imports an external channel playlist into public/channels.json.
//
//   node scripts/import-playlist.mjs <playlist.json> [--probe-cache <file>]
//                                     [--mark-new] [--dry-run]
//
// Every candidate stream is fetched first: a manifest we cannot reach is dead
// for the browser too, and whether the host sends `Access-Control-Allow-Origin`
// decides if the option has to go through /api/hls-proxy.

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { flattenPlaylist, mergePlaylist, proxyHostsFrom } from './playlistImport.mjs';

const PROBE_CONCURRENCY = 24;
const PROBE_TIMEOUT_MS = 9000;
// Manifests run to tens of kilobytes and the Representation list sits at the end,
// so the whole document is read; the cap only guards against a huge non-manifest.
const MANIFEST_PEEK = 512 * 1024;
const CHANNELS_PATH = path.join(process.cwd(), 'public', 'channels.json');
const PROXY_HOSTS_PATH = path.join(process.cwd(), 'lib', 'proxyHosts.ts');

function parseArgs(argv) {
  const args = { playlist: null, probeCache: null, dryRun: false, markNew: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--mark-new') args.markNew = true;
    else if (argv[i] === '--probe-cache') args.probeCache = argv[++i];
    else if (!args.playlist) args.playlist = argv[i];
  }
  return args;
}

/**
 * The path a `tok_<jwt>` token is scoped to. The payload is base64url JSON with
 * a `path` claim; anything outside that directory is refused by the CDN.
 */
export function tokenPathClaim(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return typeof payload.path === 'string' ? payload.path : null;
  } catch {
    return null;
  }
}

const directoryOf = (url) => new URL(url).pathname.replace(/[^/]*$/, '');

/** True when a token's claim covers the directory the stream actually plays from. */
export function tokenCoversMedia(token, streamUrl) {
  const claim = tokenPathClaim(token);
  if (!claim) return false;
  return directoryOf(streamUrl).endsWith(claim);
}

/** The key id a DASH manifest is currently encrypted with, as lowercase hex. */
function manifestKid(body) {
  const raw = body.match(/default_KID="([^"]+)"/i)?.[1];
  return raw ? raw.replace(/-/g, '').toLowerCase() : null;
}

async function probeUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
    });
    const body = response.ok ? (await response.text()).slice(0, MANIFEST_PEEK) : '';
    const isMpd = body.includes('<MPD');
    return {
      status: response.status,
      cors: response.headers.get('access-control-allow-origin') ?? '',
      isM3u: body.includes('#EXTM3U'),
      isMpd,
      manifestKid: manifestKid(body),
    };
  } catch {
    return { status: 0, cors: '', isM3u: false, isMpd: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Token-gated rows cannot be probed directly — the {token} placeholder is not a
 * real URL. The row's `token` URL redirects to `…/tok_<jwt>/…`; that token goes
 * into the template, and the substituted URL is what gets probed. The playlist's
 * own Origin/Referer headers must NOT be sent: the token endpoint answers 403 to
 * them.
 */
export function extractPathToken(redirectedUrl) {
  return redirectedUrl.match(/\/tok_([^/]+)\//)?.[1] ?? null;
}

async function probeTokenTemplate(row) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resolved = await fetch(row.tokenUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const token = extractPathToken(resolved.url);
    if (!token) return { status: resolved.status, cors: '', isM3u: false, isMpd: false };
    const streamUrl = row.url.replace('{token}', token);
    const stream = await fetch(streamUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const body = stream.ok ? (await stream.text()).slice(0, MANIFEST_PEEK) : '';
    const isMpd = body.includes('<MPD');
    return {
      status: stream.status,
      cors: stream.headers.get('access-control-allow-origin') ?? '',
      isM3u: body.includes('#EXTM3U'),
      isMpd,
      manifestKid: manifestKid(body),
      tokenCoversMedia: tokenCoversMedia(token, streamUrl),
    };
  } catch {
    return { status: 0, cors: '', isM3u: false, isMpd: false };
  } finally {
    clearTimeout(timer);
  }
}

async function probeTokenRows(rows, probes) {
  const pending = rows.filter(r => !probes.has(r.url));
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const row = pending[cursor++];
      probes.set(row.url, await probeTokenTemplate(row));
      if (cursor % 25 === 0) process.stderr.write(`  resolved ${cursor}/${pending.length} tokens
`);
    }
  };
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
}

async function probeAll(urls, cached) {
  const probes = new Map(cached);
  const pending = urls.filter(url => !probes.has(url));
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const url = pending[cursor++];
      probes.set(url, await probeUrl(url));
      if (cursor % 25 === 0) process.stderr.write(`  probed ${cursor}/${pending.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
  return probes;
}

/** The proxy allowlist is generated rather than read at runtime so the set of
 *  reachable hosts is visible in review and cannot drift with a data-only edit. */
function renderProxyHosts(hosts) {
  const lines = hosts.map(h => `  '${h}',`).join('\n');
  return [
    '// Generated by scripts/import-playlist.mjs — do not edit by hand.',
    '// Origins the HLS proxy may fetch, derived from the proxied options in',
    '// public/channels.json.',
    'export const GENERATED_PROXY_HOSTS: readonly string[] = [',
    lines,
    '];',
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.playlist) {
    console.error('usage: node scripts/import-playlist.mjs <playlist.json> [--probe-cache <file>] [--mark-new] [--dry-run]');
    process.exit(1);
  }

  const playlist = JSON.parse(await readFile(args.playlist, 'utf8'));
  const rows = flattenPlaylist(playlist);
  const existing = JSON.parse(await readFile(CHANNELS_PATH, 'utf8'));

  let cached = [];
  if (args.probeCache) {
    try {
      cached = JSON.parse(await readFile(args.probeCache, 'utf8'));
    } catch {
      cached = [];
    }
  }

  const tokenRows = rows.filter(r => r.tokenUrl && r.url.includes('{token}'));
  const tokenUrls = new Set(tokenRows.map(r => r.url));

  // Embed pages block server-side fetches, so only stream manifests are probed.
  const candidates = [...new Set(
    rows.filter(r => r.url && !tokenUrls.has(r.url)
                  && r.licenseType !== 'widevine' && r.licenseType !== 'website')
        .map(r => r.url)
  )];
  console.error(`playlist rows: ${rows.length}, probing ${candidates.length} urls and ${tokenUrls.size} token templates…`);
  const probes = await probeAll(candidates, cached);
  await probeTokenRows(tokenRows, probes);
  if (args.probeCache) await writeFile(args.probeCache, JSON.stringify([...probes], null, 2));

  const { channels, stats } = mergePlaylist(existing, rows, probes, { markNew: args.markNew });

  console.log(`channels: ${existing.length} -> ${channels.length} (+${stats.newChannels} new)`);
  console.log(`options added: ${stats.added}, already present: ${stats.duplicates}`);
  console.log('skipped:', stats.skipped);
  console.log(`hosts needing the hls proxy: ${proxyHostsFrom(channels).length}`);

  if (args.dryRun) {
    console.log('(dry run — channels.json untouched)');
    return;
  }
  await writeFile(CHANNELS_PATH, `${JSON.stringify(channels, null, 2)}\n`);
  await writeFile(PROXY_HOSTS_PATH, renderProxyHosts(proxyHostsFrom(channels)));
  console.log(`wrote ${CHANNELS_PATH} and ${PROXY_HOSTS_PATH}`);
}

// Importing this module (the tests do) must not run the import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
