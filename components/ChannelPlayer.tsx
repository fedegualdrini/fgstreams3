'use client';

import { useMemo } from 'react';
import type { Channel, ChannelOption } from '@/types/channels';
import { getPlayableOptions } from '@/lib/channelOptions';
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
}

export default function ChannelPlayer({
  channel,
  initialOptionIndex = 0,
  onOptionChange,
  fillContainer = false,
  hideTabs = false,
}: ChannelPlayerProps) {
  const validOptions = useMemo(() => getPlayableOptions(channel), [channel]);
  const { selectedIndex, selectOption, tryNextOption } = useOptionSelection(
    validOptions.length,
    initialOptionIndex,
    onOptionChange,
  );
  const load = useChannelLoadState(selectedIndex);

  const currentOption: ChannelOption | undefined = validOptions[selectedIndex];
  const hasAlternatives = validOptions.length > 1;

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
        {load.isLoading && !load.timedOut && <LoadingOverlay seconds={load.loadingSeconds} />}
        {load.timedOut && (
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
        {currentOption && (
          <ChannelStream
            key={`${channel.name}-${selectedIndex}-${load.reloadKey}`}
            channelName={channel.name}
            option={currentOption}
            onPlaying={load.markPlaying}
            onError={load.markFailed}
          />
        )}
      </div>

      {!fillContainer && (
        <div className="channel-player__controls">
          <button type="button" className="link-button" onClick={load.reload}>Reload</button>
          {hasAlternatives && (
            <button type="button" className="link-button" onClick={tryNextOption}>Next option</button>
          )}
          {currentOption && <span className="channel-player__current">{currentOption.name}</span>}
        </div>
      )}
    </div>
  );
}
