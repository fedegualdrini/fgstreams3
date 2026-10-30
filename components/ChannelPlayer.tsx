'use client';

import { useMemo } from 'react';
import type { Channel, ChannelOption } from '@/types/channels';
import { getPlayableOptions } from '@/lib/channelOptions';
import { getDirectPlayback } from '@/lib/directPlayback';
import { isLpfCdnUrl } from '@/lib/lpfUrls';
import ChannelStream from '@/components/channels/ChannelStream';
import OptionPicker from '@/components/channels/OptionPicker';
import { LoadingOverlay, TimeoutOverlay } from '@/components/channels/PlayerOverlays';
import { useChannelLoadState } from '@/components/channels/useChannelLoadState';
import { useOptionSelection } from '@/components/channels/useOptionSelection';

interface ChannelPlayerProps {
  channel: Channel;
  initialOptionIndex?: number;
  onOptionChange?: (index: number) => void;
  fillContainer?: boolean;
  hideTabs?: boolean;
  lpfRefreshing?: boolean;
  onPlaybackChange?: (index: number, option: ChannelOption, playing: boolean) => void;
}

export default function ChannelPlayer({
  channel,
  initialOptionIndex = 0,
  onOptionChange,
  fillContainer = false,
  hideTabs = false,
  lpfRefreshing = false,
  onPlaybackChange,
}: ChannelPlayerProps) {
  const isLpf = channel.source === 'lpf';
  const validOptions = useMemo(
    () => channel.source === 'lpf' ? channel.options : getPlayableOptions(channel),
    [channel],
  );
  const { selectedIndex, selectOption, tryNextOption } = useOptionSelection(
    validOptions.length,
    initialOptionIndex,
    onOptionChange,
  );
  const currentOption: ChannelOption | undefined = validOptions[selectedIndex];
  const lpfBlocked = isLpf && (!currentOption || currentOption.status === 'ended'
    || currentOption.status === 'unavailable' || !isLpfCdnUrl(currentOption.iframe));
  const load = useChannelLoadState(`${channel.name}-${selectedIndex}-${currentOption?.iframe}-${lpfBlocked}`);
  const lpfMessage = currentOption?.status === 'ended'
    ? { title: 'Broadcast finished', detail: 'This broadcast has ended. Refresh links to check for a new game, or select another source.' }
    : currentOption?.status === 'unavailable'
      ? { title: 'Source unavailable', detail: 'No current broadcast is available for this source. Refresh links or select another source.' }
      : lpfRefreshing
        ? { title: 'Checking broadcast…', detail: 'Looking up the current stream for this numbered source.' }
        : { title: 'Broadcast status unknown', detail: 'The current stream could not be confirmed. Refresh links or select another source.' };
  const hasAlternatives = validOptions.length > 1;
  // Direct playback owns loading/error UI so outer overlays cannot hide its controls.
  const ownsPlaybackState = currentOption ? getDirectPlayback(currentOption.iframe) !== null : false;

  if (validOptions.length === 0) {
    return (
      <div className={fillContainer ? 'channel-player__empty channel-player__empty--fill' : 'channel-player__empty video-container'}>
        No streams available for this channel
      </div>
    );
  }

  return (
    <div className={fillContainer ? 'channel-player channel-player--fill' : 'channel-player'}>
      {!fillContainer && !hideTabs && hasAlternatives && (
        <div className="channel-player__tabs">
          {validOptions.map((option, i) => (
            <button
              key={i}
              type="button"
              className="btn"
              aria-pressed={i === selectedIndex}
              onClick={() => selectOption(i)}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}

      <div className={fillContainer ? 'channel-player__stage channel-player__stage--fill' : 'channel-player__stage video-container'}>
        {lpfBlocked && (
          <div className="channel-player__empty channel-player__empty--fill channel-player__notice" role="status">
            <strong>{lpfMessage.title}</strong>
            <p>{lpfMessage.detail}</p>
          </div>
        )}
        {!lpfBlocked && !ownsPlaybackState && load.isLoading && !load.timedOut && <LoadingOverlay seconds={load.loadingSeconds} />}
        {!lpfBlocked && !ownsPlaybackState && load.timedOut && (
          <TimeoutOverlay canTryNext={hasAlternatives} onTryNext={tryNextOption} onRetry={load.reload} />
        )}
        {fillContainer && !hideTabs && hasAlternatives && (
          <OptionPicker
            key={channel.name}
            options={validOptions}
            selectedIndex={selectedIndex}
            onSelect={selectOption}
          />
        )}
        {!lpfBlocked && currentOption && (
          <ChannelStream
            key={`${channel.name}-${selectedIndex}-${currentOption.iframe}-${load.reloadKey}`}
            channelName={channel.name}
            option={currentOption}
            onPlaying={() => {
              load.markPlaying();
              onPlaybackChange?.(selectedIndex, currentOption, true);
            }}
            onError={() => {
              load.markFailed();
              onPlaybackChange?.(selectedIndex, currentOption, false);
            }}
          />
        )}
      </div>

      {!fillContainer && (
        <div className="channel-player__controls">
          {!lpfBlocked && <button type="button" className="link-button" onClick={load.reload}>Reload</button>}
          {hasAlternatives && (
            <button type="button" className="link-button" onClick={tryNextOption}>Next option</button>
          )}
          {currentOption && <span className="channel-player__current">{currentOption.name}</span>}
        </div>
      )}
    </div>
  );
}
