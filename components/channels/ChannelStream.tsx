import type { ChannelOption } from '@/types/channels';
import { isDashUrl, isHlsUrl } from '@/lib/urlValidation';
import DashVideoPlayer from '@/components/DashVideoPlayer';
import HLSVideoPlayer from '@/components/HLSVideoPlayer';
import { getDirectPlayback } from '@/lib/directPlayback';
import DirectPlayback from '@/components/players/DirectPlayback';

const IFRAME_PERMISSIONS =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';

interface ChannelStreamProps {
  channelName: string;
  option: ChannelOption;
  onPlaying: () => void;
  onError: () => void;
}

/** Renders DASH/HLS engines, supported direct playback, or the original provider embed. */
export default function ChannelStream({ channelName, option, onPlaying, onError }: ChannelStreamProps) {
  if (isDashUrl(option.iframe)) {
    return <DashVideoPlayer src={option.iframe} clearKeys={option.clearKeys} onPlaying={onPlaying} onError={onError} />;
  }

  if (isHlsUrl(option.iframe)) {
    return <HLSVideoPlayer src={option.iframe} forceProxy={option.proxy} onPlaying={onPlaying} onError={onError} />;
  }

  const iframe = (
    <iframe
      src={option.iframe}
      title={`${channelName} - ${option.name}`}
      allow={IFRAME_PERMISSIONS}
      allowFullScreen
      className="channel-player__frame"
      onLoad={onPlaying}
    />
  );

  return getDirectPlayback(option.iframe)
    ? <DirectPlayback key={option.iframe} embedUrl={option.iframe} fillParent onPlaying={onPlaying}>{iframe}</DirectPlayback>
    : iframe;
}
