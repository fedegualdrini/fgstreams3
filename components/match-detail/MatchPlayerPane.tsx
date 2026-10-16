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
  /** Bumped to remount the player and start a fresh playback attempt. */
  reloadCount: number;
}

export default function MatchPlayerPane(props: MatchPlayerPaneProps) {
  return (
    <section className="split-layout__main">
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
  reloadCount,
}: MatchPlayerPaneProps) {
  if (channel) {
    return <ChannelPlayer key={`${channel.channel}:${reloadCount}`} channel={broadcastToChannel(channel)} fillContainer />;
  }
  if (allStreamsFailed || !hasStreams) {
    return <NoStreamsPanel allFailed={allStreamsFailed} onRetry={onRetry} />;
  }
  return <StreamPlayer key={reloadCount} stream={stream} onError={onStreamError} fillParent />;
}
