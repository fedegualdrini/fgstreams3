export interface ChannelOption {
  name: string;
  iframe: string;
  /** Route the stream through /api/hls-proxy — the origin sends no CORS header. */
  proxy?: boolean;
  /** ClearKey material for a DASH option, as { kidHex: keyHex }. */
  clearKeys?: Record<string, string>;
}

export interface Channel {
  name: string;
  logo: string;
  options: ChannelOption[];
  show: boolean;
  source?: string;
}
