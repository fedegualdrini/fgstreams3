import type { AngulismoEvent, BroadcastChannel, PromiedosGame } from '@/types/api';
import type { Channel } from '@/types/channels';
import { isValidStreamUrl } from './urlValidation';
import { normalizeText } from './teamMatch';

/**
 * Turns the broadcaster names Promiedos publishes into entries from our own
 * channel catalog (public/channels.json).
 *
 * The two vocabularies only partly overlap: Promiedos names the commercial
 * product ("TNT Sports Premium", "Disney+ Premium"), the catalog names the feed
 * ("TNT Sports", "Disney+"). Networks with no counterpart — streaming-only
 * packages such as LPF Play or HBO MAX — are dropped rather than guessed at.
 */

// Promiedos network name (normalized) → catalog channel names, best first.
const NETWORK_TO_CHANNELS: Record<string, string[]> = {
  'espn premium': ['ESPN Premium'],
  'espn': ['ESPN 1'],
  'espn 2': ['ESPN 2'],
  'espn 3': ['ESPN 3'],
  'espn 4': ['ESPN 4'],
  'espn 5': ['ESPN 5'],
  'espn 6': ['ESPN 6'],
  'espn 7': ['ESPN 7'],
  'espn deportes': ['ESPN Deportes'],
  'tnt sports premium': ['TNT Sports'],
  'tnt sports': ['TNT Sports'],
  'tyc sports': ['TyC Sports'],
  'tyc sports internacional': ['TYC Sports Internacional', 'TyC Sports'],
  'telefe': ['Telefe'],
  'tv publica': ['TV Publica'],
  'television publica': ['TV Publica'],
  'disney premium': ['Disney+'],
  'disney': ['Disney+'],
  'star': ['Disney+'],
  'dsports': ['DSports'],
  'dsports 2': ['DSports 2'],
  'dsports plus': ['DSports Plus'],
  'directv sports': ['DSports'],
  'directv sports 2': ['DSports 2'],
  'directv sports plus': ['DSports Plus'],
  'fanatiz': ['Fanatiz'],
  'apple tv': ['Apple TV'],
  'prime video': ['Prime Video'],
  'amazon prime video': ['Prime Video'],
  'claro sports': ['Claro Sports'],
  'win sports': ['WIN Sports+', 'WIN Sports'],
  'golperu': ['GOLPERU'],
  'gol tv': ['GolTV'],
  'goltv': ['GolTV'],
  'vtv': ['VTV'],
  'vtv plus': ['VTV PLUS'],
  'tigo sports': ['TIGO Sports'],
  'fox sports': ['FOX Sports'],
  'fox sports 2': ['FOX Sports 2'],
  'fox sports 3': ['FOX Sports 3'],
  'fox one': ['FOX One'],
  'sportv': ['SporTV BR'],
  'premiere': ['Premiere'],
  'movistar plus': ['Canales de España'],
  'dazn': ['DAZN 1'],
};

// Promiedos league id → catalog channel dedicated to that competition. These
// catalog entries aggregate many mirrors for one competition, so they are worth
// offering even when the exact broadcaster is already resolved.
const LEAGUE_TO_CHANNELS: Record<string, string[]> = {
  hc: ['Superliga Argentina'],          // Liga Profesional Argentina
  hcbe: ['Superliga Argentina'],        // Copa de la Liga Profesional
  gea: ['Superliga Argentina'],         // Copa Argentina
  ebj: ['Primera B Nacional'],          // Primera Nacional
  dij: ['Copa Sudamericana'],           // CONMEBOL Sudamericana
  bbd: ['Brasileirao'],                 // Brasileirao Serie A
  bb: ['LaLiga'],                       // LaLiga
  h: ['Premier League'],                // Premier League
  bae: ['MLS'],                         // MLS
  gbd: ['Mundial 2026'],                // CONMEBOL WC qualification
  gbb: ['Mundial 2026'],                // CONCACAF WC qualification
};

// Competition names that identify the league channel when the id is unknown.
const LEAGUE_NAME_TO_CHANNELS: Array<[RegExp, string[]]> = [
  [/libertadores/i, ['Copa Libertadores']],
  [/sudamericana/i, ['Copa Sudamericana']],
  [/liga profesional|copa de la liga|copa argentina/i, ['Superliga Argentina']],
  [/primera nacional/i, ['Primera B Nacional']],
  [/champions league/i, ['Champions League']],
  [/europa league/i, ['Europa League']],
  [/brasileirao|brasileirão/i, ['Brasileirao']],
];

/** "Disney+ Premium" → "disney premium"; "HBO MAX (Suscripción...)" → "hbo max". */
export function normalizeNetworkName(network: string): string {
  // The parenthetical is a commercial note ("Suscripción Pack fútbol"), never
  // part of the channel's identity.
  return normalizeText(network.replace(/\([^)]*\)/g, ' '));
}

function findChannel(channels: Channel[], name: string): Channel | undefined {
  const target = normalizeText(name);
  return channels.find((channel) => normalizeText(channel.name) === target);
}

function toBroadcast(network: string, channel: Channel): BroadcastChannel {
  return {
    network,
    channel: channel.name,
    logo: channel.logo,
    options: channel.options.filter((option) => isValidStreamUrl(option.iframe)),
  };
}

function channelNamesForNetwork(network: string): string[] {
  const key = normalizeNetworkName(network);
  if (NETWORK_TO_CHANNELS[key]) return NETWORK_TO_CHANNELS[key];

  // "ESPN Premium HD" / "TNT Sports Premium 2" style suffixes: retry on the
  // longest known prefix so new variants keep resolving.
  const prefixMatch = Object.keys(NETWORK_TO_CHANNELS)
    .filter((known) => key.startsWith(`${known} `))
    .sort((a, b) => b.length - a.length)[0];

  return prefixMatch ? NETWORK_TO_CHANNELS[prefixMatch] : [];
}

function leagueChannelNames(game: PromiedosGame): string[] {
  if (LEAGUE_TO_CHANNELS[game.leagueId]) return LEAGUE_TO_CHANNELS[game.leagueId];
  for (const [pattern, names] of LEAGUE_NAME_TO_CHANNELS) {
    if (pattern.test(game.league)) return names;
  }
  return [];
}

/**
 * Channels from the local catalog that carry this fixture: the broadcasters
 * Promiedos lists first, then the competition's own channel as a fallback.
 */
export function resolveBroadcastChannels(
  game: PromiedosGame,
  channels: Channel[],
): BroadcastChannel[] {
  const resolved: BroadcastChannel[] = [];
  const seen = new Set<string>();

  const add = (network: string, channelName: string) => {
    const channel = findChannel(channels, channelName);
    if (!channel || seen.has(channel.name)) return;

    // Guard on the playable options, not the raw ones: a channel whose entries
    // are all "undefined" placeholders is not a viewing option.
    const broadcast = toBroadcast(network, channel);
    if (broadcast.options.length === 0) return;

    seen.add(channel.name);
    resolved.push(broadcast);
  };

  for (const network of game.networks) {
    for (const channelName of channelNamesForNetwork(network)) {
      add(network, channelName);
    }
  }

  for (const channelName of leagueChannelNames(game)) {
    add(game.league || channelName, channelName);
  }

  return resolved;
}

/**
 * Channels for a fixture the angulismo feed already knows about.
 *
 * This path is stronger than the Promiedos one because the feed carries the
 * playable URLs itself: there is no name to resolve and no chance of resolving
 * it wrongly. Where we also hold the channel locally, the two option lists are
 * merged — live URLs first, ours behind them — and where we do not, the feed's
 * channel is offered on its own, which is how channels missing from our catalog
 * (regional feeds, pay-per-view) become available at all.
 */
export function broadcastsFromEvent(
  event: AngulismoEvent,
  channels: Channel[],
): BroadcastChannel[] {
  const resolved: BroadcastChannel[] = [];
  const seen = new Set<string>();

  for (const eventChannel of event.channels) {
    const local = findChannel(channels, eventChannel.name);
    const name = local?.name ?? eventChannel.name;
    if (seen.has(name)) continue;

    const liveUrls = new Set(eventChannel.options.map((option) => option.iframe));
    const options = [
      ...eventChannel.options,
      ...(local?.options ?? []).filter((option) => !liveUrls.has(option.iframe)),
    ].filter((option) => isValidStreamUrl(option.iframe));
    if (options.length === 0) continue;

    seen.add(name);
    resolved.push({
      network: eventChannel.name,
      channel: name,
      logo: local?.logo || eventChannel.logo,
      options,
    });
  }

  return resolved;
}

/** Append `extra` entries for channels not already present in `primary`. */
export function mergeBroadcasts(
  primary: BroadcastChannel[],
  extra: BroadcastChannel[],
): BroadcastChannel[] {
  const seen = new Set(primary.map((broadcast) => normalizeText(broadcast.channel)));
  return [
    ...primary,
    ...extra.filter((broadcast) => !seen.has(normalizeText(broadcast.channel))),
  ];
}
