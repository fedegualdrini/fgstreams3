import type { ChannelOption } from '@/types/channels';
import { isDashUrl, isHlsUrl } from '@/lib/urlValidation';
import DashVideoPlayer from '@/components/DashVideoPlayer';
import HLSVideoPlayer from '@/components/HLSVideoPlayer';
import { isEmbedStUrl } from '@/lib/embedSt';
import { isStreamTpUrl } from '@/lib/streamTp';
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

  const provider = isEmbedStUrl(option.iframe) ? 'embed-st'
    : isStreamTpUrl(option.iframe) ? 'streamtp' : null;
  return provider
    ? <DirectPlayback key={option.iframe} provider={provider} sourceUrl={option.iframe} fillParent onPlaying={onPlaying}>{iframe}</DirectPlayback>
    : iframe;
}
