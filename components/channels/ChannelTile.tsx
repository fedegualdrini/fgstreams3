import type { Channel } from '@/types/channels';
import { pluralize } from '@/lib/channelOptions';
import ChannelLogo from './ChannelLogo';

const INITIALS_LENGTH = 3;

interface ChannelTileProps {
  channel: Channel;
  streamCount: number;
  onSelect: (channel: Channel) => void;
}

export default function ChannelTile({ channel, streamCount, onSelect }: ChannelTileProps) {
  return (
    <button type="button" className="channel-tile" onClick={() => onSelect(channel)}>
      {channel.logo ? (
        <ChannelLogo src={channel.logo} className="channel-tile__logo" />
      ) : (
        <div className="channel-tile__initials">
          {channel.name.slice(0, INITIALS_LENGTH).toUpperCase()}
        </div>
      )}
      <span className="channel-tile__name">{channel.name}</span>
      <span className="channel-tile__count">{pluralize(streamCount, 'stream')}</span>
      {channel.source === 'hls' && <span className="channel-tile__hls">HLS</span>}
    </button>
  );
}
