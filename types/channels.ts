export type ChannelOptionStatus = 'live' | 'ended' | 'unavailable' | 'unknown';

export interface ChannelOption {
  name: string;
  iframe: string;
  /** Route the stream through /api/hls-proxy — the origin sends no CORS header. */
  proxy?: boolean;
  /** ClearKey material for a DASH option, as { kidHex: keyHex }. */
  clearKeys?: Record<string, string>;
  /** Stable provider URL, before resolving the current game's CDN destination. */
  sourceUrl?: string;
  /** Current playlist availability; omitted for channels that are not probed. */
  status?: ChannelOptionStatus;
}

export interface Channel {
  name: string;
  logo: string;
  options: ChannelOption[];
  show: boolean;
  source?: string;
}

export interface LpfChannelSnapshot {
  channel: Channel;
  checkedAt: number;
  error?: string;
}
