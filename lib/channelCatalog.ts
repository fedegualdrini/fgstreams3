import { readFile } from 'fs/promises';
import path from 'path';
import type { Channel } from '@/types/channels';
import { isValidStreamUrl } from './urlValidation';
import { normalizeText } from './teamMatch';
import { fetchAngulismoData } from './angulismo';

let staticCatalog: Channel[] | null = null;

/**
 * The catalog that ships with the build. Read once per process — it cannot
 * change between requests.
 */
export async function getStaticChannelCatalog(): Promise<Channel[]> {
  if (staticCatalog) return staticCatalog;

  const filePath = path.join(process.cwd(), 'public', 'channels.json');
  const raw = await readFile(filePath, 'utf-8');
  const all: Channel[] = JSON.parse(raw);

  staticCatalog = all.filter(
    (channel) => channel.show && channel.options.some((option) => isValidStreamUrl(option.iframe)),
  );
  return staticCatalog;
}

/**
 * Merge live options into a channel, freshest first.
 *
 * public/channels.json was snapshotted from the same upstream and its mirrors
 * have since moved — several of its hosts no longer resolve at all. Live
 * options are therefore tried first, but the old ones are kept behind them
 * rather than discarded: a mirror we already have costs nothing and may still
 * work.
 */
function mergeOptions(live: Channel, existing: Channel): Channel {
  const seen = new Set(live.options.map((option) => option.iframe));
  const merged = [
    ...live.options,
    ...existing.options.filter((option) => !seen.has(option.iframe)),
  ];

  return {
    ...existing,
    logo: existing.logo || live.logo,
    options: merged.filter((option) => isValidStreamUrl(option.iframe)),
  };
}

/** Exported for tests; `getChannelCatalog` is the entry point. */
export function mergeChannelCatalogs(base: Channel[], live: Channel[]): Channel[] {
  const byName = new Map(base.map((channel) => [normalizeText(channel.name), channel]));

  for (const liveChannel of live) {
    const key = normalizeText(liveChannel.name);
    const existing = byName.get(key);
    byName.set(key, existing ? mergeOptions(liveChannel, existing) : liveChannel);
  }

  return [...byName.values()];
}

/**
 * Visible channels with at least one playable option: the shipped catalog,
 * refreshed from the live feed so it does not rot between deploys. A failed
 * lookup falls back to the shipped catalog alone.
 */
export async function getChannelCatalog(): Promise<Channel[]> {
  const base = await getStaticChannelCatalog();
  try {
    const { channels, ok } = await fetchAngulismoData();
    return ok && channels.length > 0 ? mergeChannelCatalogs(base, channels) : base;
  } catch (error) {
    console.error('channelCatalog: live refresh failed, serving the shipped catalog:', error);
    return base;
  }
}
