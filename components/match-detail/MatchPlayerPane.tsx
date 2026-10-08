import type { BroadcastChannel, Stream } from '@/types/api';
import { broadcastToChannel } from '@/lib/matchDetailStreams';
import ChannelPlayer from '@/components/ChannelPlayer';
import StreamPlayer from '@/components/StreamPlayer';
import NoStreamsPanel from './NoStreamsPanel';

interface MatchPlayerPaneProps {
  /** TV channel being watched; takes precedence over direct streams. */
  channel: BroadcastChannel | null;
  stream: Stream | null;
  hasStreams: boolean;
  allStreamsFailed: boolean;
  onStreamError: () => void;
  onRetry: () => void;
}

export default function MatchPlayerPane(props: MatchPlayerPaneProps) {
  return (
    <section className="detail-player">
      <PlayerContent {...props} />
    </section>
  );
}

function PlayerContent({
  channel,
  stream,
  hasStreams,
  allStreamsFailed,
  onStreamError,
  onRetry,
}: MatchPlayerPaneProps) {
  if (channel) {
    return <ChannelPlayer key={channel.channel} channel={broadcastToChannel(channel)} fillContainer />;
  }
  if (allStreamsFailed || !hasStreams) {
    return <NoStreamsPanel allFailed={allStreamsFailed} onRetry={onRetry} />;
  }
  return <StreamPlayer stream={stream} onError={onStreamError} fillParent />;
}
