// Network probing for the playlist importer: fetches each candidate stream to
// learn whether it is reachable, what kind of manifest it serves and whether the
// host sends CORS headers. Results feed `classifyRow` in playlistImport.mjs.
//
// A probe is a plain object: { status, cors, isM3u, isMpd, manifestKid?, tokenCoversMedia? }.
// status 0 means the request itself failed (timeout, DNS, refused).

const PROBE_CONCURRENCY = 24;
const PROBE_TIMEOUT_MS = 9_000;
const PROGRESS_EVERY = 25;
const PROBE_USER_AGENT = 'Mozilla/5.0';
// Manifests run to tens of kilobytes and the Representation list sits at the end,
// so the whole document is read; the cap only guards against a huge non-manifest.
const MANIFEST_MAX_CHARS = 512 * 1024;

const UNREACHABLE = { status: 0, cors: '', isM3u: false, isMpd: false };

// ─── Token helpers (pure) ───────────────────────────────────────────────────

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

/** True when a token's claim covers the directory the stream actually plays from. */
export function tokenCoversMedia(token, streamUrl) {
  const claim = tokenPathClaim(token);
  if (!claim) return false;
  const streamDirectory = new URL(streamUrl).pathname.replace(/[^/]*$/, '');
  return streamDirectory.endsWith(claim);
}

/**
 * Token-gated rows cannot be probed directly — the {token} placeholder is not a
 * real URL. The row's `token` URL redirects to `…/tok_<jwt>/…`; that token goes
 * into the template, and the substituted URL is what gets probed.
 */
export function extractPathToken(redirectedUrl) {
  return redirectedUrl.match(/\/tok_([^/]+)\//)?.[1] ?? null;
}

/** The key id a DASH manifest is currently encrypted with, as lowercase hex. */
function manifestKid(body) {
  const raw = body.match(/default_KID="([^"]+)"/i)?.[1];
  return raw ? raw.replace(/-/g, '').toLowerCase() : null;
}

// ─── Probing ────────────────────────────────────────────────────────────────

/** Summarise a manifest response: reachability, CORS, manifest kind and key id. */
async function describeResponse(response) {
  const body = response.ok ? (await response.text()).slice(0, MANIFEST_MAX_CHARS) : '';
  return {
    status: response.status,
    cors: response.headers.get('access-control-allow-origin') ?? '',
    isM3u: body.includes('#EXTM3U'),
    isMpd: body.includes('<MPD'),
    manifestKid: manifestKid(body),
  };
}

/** Run `probe(signal)` under the shared deadline; any failure counts as unreachable. */
async function withDeadline(probe) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await probe(controller.signal);
  } catch {
    return UNREACHABLE;
  } finally {
    clearTimeout(timer);
  }
}

function probeUrl(url) {
  return withDeadline(async (signal) =>
    describeResponse(await fetch(url, {
      signal,
      redirect: 'follow',
      headers: { 'User-Agent': PROBE_USER_AGENT, Accept: '*/*' },
    })),
  );
}

// The playlist's own Origin/Referer headers must NOT be sent when resolving a
// token: the token endpoint answers 403 to them.
function probeTokenTemplate(row) {
  return withDeadline(async (signal) => {
    const resolved = await fetch(row.tokenUrl, {
      signal,
      redirect: 'follow',
      headers: { 'User-Agent': PROBE_USER_AGENT },
    });
    const token = extractPathToken(resolved.url);
    if (!token) return { ...UNREACHABLE, status: resolved.status };

    const streamUrl = row.url.replace('{token}', token);
    const stream = await fetch(streamUrl, {
      signal,
      headers: { 'User-Agent': PROBE_USER_AGENT },
    });
    return { ...(await describeResponse(stream)), tokenCoversMedia: tokenCoversMedia(token, streamUrl) };
  });
}

/** Run `handler` over `items` with PROBE_CONCURRENCY workers, reporting progress on stderr. */
async function forEachConcurrent(items, handler, describeProgress) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await handler(item);
      if (cursor % PROGRESS_EVERY === 0) {
        process.stderr.write(`  ${describeProgress(cursor, items.length)}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
}

/** Probe every URL not already in `cached` (an array of [url, probe] pairs). Returns Map<url, probe>. */
export async function probeAll(urls, cached) {
  const probes = new Map(cached);
  const pending = urls.filter(url => !probes.has(url));
  await forEachConcurrent(
    pending,
    async (url) => { probes.set(url, await probeUrl(url)); },
    (done, total) => `probed ${done}/${total}`,
  );
  return probes;
}

/** Resolve and probe token-gated rows, adding their results to `probes`. */
export async function probeTokenRows(rows, probes) {
  const pending = rows.filter(row => !probes.has(row.url));
  await forEachConcurrent(
    pending,
    async (row) => { probes.set(row.url, await probeTokenTemplate(row)); },
    (done, total) => `resolved ${done}/${total} tokens`,
  );
}
