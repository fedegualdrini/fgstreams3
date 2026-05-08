export interface ChannelOption {
  name: string;
  iframe: string;
}

export interface Channel {
  name: string;
  logo: string;
  options: ChannelOption[];
  show: boolean;
  source?: string;
}
