import type { Channel, ChannelOption } from '@/types/channels';
import { isValidStreamUrl } from './urlValidation';

/** Options of a channel that can actually be played in the browser. */
export function getPlayableOptions(channel: Channel): ChannelOption[] {
  return channel.options.filter(option => isValidStreamUrl(option.iframe));
}

/** Case-insensitive substring match on the channel name; a blank query keeps everything. */
export function filterChannelsByName(channels: Channel[], search: string): Channel[] {
  if (!search.trim()) return channels;
  const query = search.toLowerCase();
  return channels.filter(channel => channel.name.toLowerCase().includes(query));
}

/** Clamps a (possibly stale or URL-supplied) option index into the playable range. */
export function clampOptionIndex(index: number, optionCount: number): number {
  return Math.min(index, Math.max(optionCount - 1, 0));
}

/** The `?c=<channel>&o=<option>` deep link, resolved against the catalog. */
export function resolveChannelDeepLink(
  channels: Channel[],
  channelParam: string | null,
  optionParam: string | null,
): { channel: Channel; optionIndex: number } | null {
  if (!channelParam) return null;
  const wanted = decodeURIComponent(channelParam).toLowerCase();
  const channel = channels.find(candidate => candidate.name.toLowerCase() === wanted);
  if (!channel) return null;

  const optionIndex = parseInt(optionParam ?? '0', 10);
  return { channel, optionIndex: isNaN(optionIndex) ? 0 : optionIndex };
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count !== 1 ? 's' : ''}`;
}
