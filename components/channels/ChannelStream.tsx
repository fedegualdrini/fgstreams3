import type { ChannelOption } from '@/types/channels';
import { isDashUrl, isHlsUrl } from '@/lib/urlValidation';
import DashVideoPlayer from '@/components/DashVideoPlayer';
import HLSVideoPlayer from '@/components/HLSVideoPlayer';

const IFRAME_PERMISSIONS =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';

interface ChannelStreamProps {
  channelName: string;
  option: ChannelOption;
  onPlaying: () => void;
  onError: () => void;
}

/** Renders one option with the engine its URL calls for: DASH, HLS, or a plain embed. */
export default function ChannelStream({ channelName, option, onPlaying, onError }: ChannelStreamProps) {
  if (isDashUrl(option.iframe)) {
    return <DashVideoPlayer src={option.iframe} clearKeys={option.clearKeys} onPlaying={onPlaying} onError={onError} />;
  }

  if (isHlsUrl(option.iframe)) {
    return <HLSVideoPlayer src={option.iframe} forceProxy={option.proxy} onPlaying={onPlaying} onError={onError} />;
  }

  return (
    <iframe
      src={option.iframe}
      title={`${channelName} - ${option.name}`}
      allow={IFRAME_PERMISSIONS}
      allowFullScreen
      className="channel-player__frame"
      onLoad={onPlaying}
    />
  );
}
