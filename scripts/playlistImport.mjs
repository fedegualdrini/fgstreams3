// Pure helpers for importing an external channel playlist (the JSON format used
// by Clippy/OTT list apps) into public/channels.json. Kept free of network and
// filesystem access so the merge rules can be unit-tested.

// The 0x80-0x9F slots CP1252 fills with punctuation and symbols; a latin1
// round-trip alone loses them, which is exactly where emoji bytes land.
const CP1252_REVERSE = new Map(
  [0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
   0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c,
   0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d,
   0x017e, 0x0178].map((cp, i) => [cp, 0x80 + i])
);

/**
 * The playlists are published as UTF-8 that was previously decoded as latin1,
 * so "⚽" arrives as "âš½". Round-tripping through latin1 restores the original.
 */
export function decodeMojibake(value) {
  if (typeof value !== 'string') return value;
  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    const byte = code <= 0xff ? code : CP1252_REVERSE.get(code);
    if (byte === undefined) return value;
    bytes.push(byte);
  }
  const restored = Buffer.from(bytes).toString('utf8');
  return restored.includes('�') ? value : restored;
}

const NOISE_TOKENS = /\b(full ?hd|fhd|uhd|hd|sd|4k|1080p?|720p?|vpn|alt|op\d+|opcion \d+|opción \d+)\b/g;

/** Collapses cosmetic differences ("TNT Sports HD 🇦🇷" vs "TNT Sports") so the
 *  same channel coming from two lists lands on one entry. */
export function normalizeName(name) {
  return decodeMojibake(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(NOISE_TOKENS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Flattens the playlist's group → station → option tree into option rows. */
export function flattenPlaylist(playlist) {
  const rows = [];
  for (const group of playlist.groups ?? []) {
    for (const station of group.stations ?? []) {
      const options = station.options?.length ? station.options : [station];
      for (const option of options) {
        rows.push({
          group: decodeMojibake(group.name),
          station: decodeMojibake(station.name),
          option: decodeMojibake(option.name ?? station.name),
          url: option.url ?? '',
          logo: option.image ?? station.image ?? '',
          licenseType: option.license_type ?? '',
          licenseKey: option.license_key ?? '',
          tokenUrl: option.token ?? '',
        });
      }
    }
  }
  return rows;
}

const UNSUPPORTED_DRM = new Set(['widevine', 'playready', 'fairplay']);
const NON_STREAM_EXT = /\.(aac|mp3|mp4|ts|m3u)(\?|$)/i;

function base64ToHex(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Buffer.from(normalized, 'base64');
  return bytes.length ? bytes.toString('hex') : null;
}

/**
 * Playlists carry ClearKey material as an EME JWK set. Shaka wants a plain
 * `{ kidHex: keyHex }` map, so the base64url values are converted up front.
 */
export function parseClearKeys(licenseKey) {
  if (!licenseKey || !licenseKey.trim().startsWith('{')) return null;
  let parsed;
  try {
    parsed = JSON.parse(licenseKey);
  } catch {
    return null;
  }
  const keys = {};
  for (const entry of parsed.keys ?? []) {
    const kid = base64ToHex(entry.kid ?? '');
    const key = base64ToHex(entry.k ?? '');
    if (kid && key) keys[kid] = key;
  }
  return Object.keys(keys).length ? keys : null;
}

/**
 * Providers rotate ClearKey material, so a playlist's key can be older than the
 * stream it belongs to. When the probe read a key id out of the manifest, the
 * listed key has to cover it — otherwise the browser gets a manifest it cannot
 * decrypt and fails with an opaque "unsupported content" error.
 */
export function keyMatchesManifest(clearKeys, probe) {
  if (!clearKeys || !probe?.manifestKid) return true;
  return Object.keys(clearKeys).includes(probe.manifestKid);
}

/** HLS is playable only when we could fetch the manifest ourselves. */
function classifyHls(parsed, probe) {
  // A manifest we cannot fetch ourselves is dead for the browser too, and an
  // unfetched .m3u8 would render as an iframe showing raw playlist text.
  if (!probe?.isM3u) return { kind: null, reason: 'hls-unreachable' };
  return { kind: 'hls', proxy: probe.cors !== '*' || parsed.protocol === 'http:' };
}

/**
 * Rows with a `token` URL redirect to `…/tok_<jwt>/…`, and that token fills the
 * {token} placeholder in the stream URL. The JWT scopes itself to one directory:
 * when that is not the directory the media sits in, the token buys the manifest
 * and nothing else, and only a paid session unlocks the rest.
 */
function classifyTokenDash(row, probe) {
  if (!probe?.isMpd) return { kind: null, reason: 'token-stream-unreachable' };
  if (!probe.tokenCoversMedia) return { kind: null, reason: 'token-scoped-to-manifest' };
  if (probe.cors !== '*') return { kind: null, reason: 'dash-no-cors' };
  const clearKeys = parseClearKeys(row.licenseKey);
  if (row.licenseType && !clearKeys) return { kind: null, reason: 'clearkey-unparsable' };
  if (!keyMatchesManifest(clearKeys, probe)) return { kind: null, reason: 'clearkey-stale' };
  return { kind: 'dash', proxy: false, clearKeys };
}

function classifyDash(row, probe) {
  // Only ClearKey is decryptable in the browser without a licence server, and
  // an MPD the network cannot reach would just spin forever in the player.
  if (!probe?.isMpd) return { kind: null, reason: 'dash-unreachable' };
  if (probe.cors !== '*') return { kind: null, reason: 'dash-no-cors' };
  if (!row.licenseType) return { kind: 'dash', proxy: false, clearKeys: null };
  const clearKeys = parseClearKeys(row.licenseKey);
  if (!clearKeys) return { kind: null, reason: 'clearkey-unparsable' };
  if (!keyMatchesManifest(clearKeys, probe)) return { kind: null, reason: 'clearkey-stale' };
  return { kind: 'dash', proxy: false, clearKeys };
}

/**
 * Decides how (or whether) FGStreams can play a playlist row.
 * `probe` is the result of fetching the URL server-side, when available.
 * Returns { kind, proxy, clearKeys? } when playable, else { kind: null, reason }.
 */
export function classifyRow(row, probe) {
  const url = row.url?.trim() ?? '';
  if (!url) return { kind: null, reason: 'no-url' };
  if (row.licenseType === 'website') return { kind: null, reason: 'not-a-stream' };
  if (UNSUPPORTED_DRM.has(row.licenseType)) return { kind: null, reason: 'unsupported-drm' };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: null, reason: 'invalid-url' };
  }

  if (url.includes('.m3u8') || probe?.isM3u === true) return classifyHls(parsed, probe);
  if (row.tokenUrl && url.includes('{token}')) return classifyTokenDash(row, probe);
  if (url.includes('.mpd')) return classifyDash(row, probe);

  if (parsed.protocol !== 'https:') return { kind: null, reason: 'insecure' };
  if (NON_STREAM_EXT.test(parsed.pathname)) return { kind: null, reason: 'not-a-stream' };
  // Embed pages cannot be validated server-side (most block non-browser fetches),
  // so they are kept on the same trust basis as the channels already in the list.
  return { kind: 'iframe', proxy: false };
}

function uniqueOptionName(taken, name) {
  const base = name.trim() || 'Option';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** Prefix put on option names when an import runs with `markNew`, so fresh entries are easy to review. */
export const NEW_OPTION_PREFIX = 'NEW · ';

/** Copy the channels and index them by normalized name, known URL and taken option names. */
function indexChannels(existingChannels) {
  const channels = existingChannels.map(c => ({ ...c, options: [...c.options] }));
  const byName = new Map();
  const knownUrls = new Set();
  const optionNames = new Map();

  for (const channel of channels) {
    const key = normalizeName(channel.name);
    if (!byName.has(key)) byName.set(key, channel);
    optionNames.set(channel, new Set(channel.options.map(o => o.name)));
    for (const option of channel.options) knownUrls.add(option.iframe);
  }

  return { channels, byName, knownUrls, optionNames };
}

function toChannelOption(name, url, verdict) {
  const option = { name, iframe: url };
  if (verdict.proxy) option.proxy = true;
  if (verdict.clearKeys) option.clearKeys = verdict.clearKeys;
  return option;
}

/**
 * Appends playlist rows to the existing channel list: rows join an existing
 * channel when the station name normalizes to the same thing, otherwise they
 * create one. URLs already present anywhere in the list are never duplicated.
 */
export function mergePlaylist(existingChannels, rows, probes = new Map(), { markNew = false } = {}) {
  const { channels, byName, knownUrls, optionNames } = indexChannels(existingChannels);
  const stats = { added: 0, newChannels: 0, duplicates: 0, skipped: {} };

  for (const row of rows) {
    const verdict = classifyRow(row, probes.get(row.url));
    if (!verdict.kind) {
      stats.skipped[verdict.reason] = (stats.skipped[verdict.reason] ?? 0) + 1;
      continue;
    }
    if (knownUrls.has(row.url)) {
      stats.duplicates++;
      continue;
    }

    const key = normalizeName(row.station);
    if (!key) {
      stats.skipped['no-name'] = (stats.skipped['no-name'] ?? 0) + 1;
      continue;
    }

    let channel = byName.get(key);
    if (!channel) {
      channel = { name: row.station.trim(), logo: row.logo ?? '', options: [], show: true, source: 'playlist' };
      channels.push(channel);
      byName.set(key, channel);
      optionNames.set(channel, new Set());
      stats.newChannels++;
    }

    const taken = optionNames.get(channel);
    const label = markNew ? `${NEW_OPTION_PREFIX}${row.option.trim()}` : row.option;
    const name = uniqueOptionName(taken, label);
    taken.add(name);
    knownUrls.add(row.url);
    channel.options.push(toChannelOption(name, row.url, verdict));
    stats.added++;
  }

  return { channels, stats };
}

/** Hosts the HLS proxy must be allowed to reach, derived from the channel list. */
export function proxyHostsFrom(channels) {
  const hosts = new Set();
  for (const channel of channels) {
    for (const option of channel.options) {
      if (!option.proxy && !option.iframe?.startsWith('http://')) continue;
      try {
        hosts.add(new URL(option.iframe).hostname);
      } catch {
        // Non-absolute entries never reach the proxy.
      }
    }
  }
  return [...hosts].sort();
}
