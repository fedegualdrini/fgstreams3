import { useEffect, useState } from 'react';
import type { Channel, ChannelOption, ChannelOptionStatus } from '@/types/channels';
import { getPlayableOptions, pluralize } from '@/lib/channelOptions';
import { isLpfCdnUrl } from '@/lib/lpfUrls';
import ChannelPlayer from '@/components/ChannelPlayer';
import ChannelLogo from './ChannelLogo';

const LPF_STATUS_LABELS: Record<ChannelOptionStatus, string> = {
  live: 'Live',
  ended: 'Broadcast finished',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
};

interface ChannelViewerProps {
  channel: Channel;
  optionIndex: number;
  onOptionChange: (index: number) => void;
  onClose: () => void;
  lpfCheckedAt?: number;
  lpfError?: string;
  lpfRefreshing?: boolean;
  onRefreshLpf?: () => void;
}

/** A channel playing full-width, with a header bar and a sidebar of its sources. */
export default function ChannelViewer({
  channel, optionIndex, onOptionChange, onClose,
  lpfCheckedAt, lpfError, lpfRefreshing = false, onRefreshLpf,
}: ChannelViewerProps) {
  const isLpf = channel.source === 'lpf';
  const sourceOptions = isLpf ? channel.options : getPlayableOptions(channel);
  const current = sourceOptions[optionIndex];
  const [playback, setPlayback] = useState<{ channel: string; index: number; option: ChannelOption }>();
  const sameSelection = playback?.channel === channel.name && playback.index === optionIndex;
  const retainingPlayback = isLpf && sameSelection && current?.status === 'unavailable';
  const options = retainingPlayback
    ? sourceOptions.map((option, index) => index === optionIndex
      ? { ...playback.option, status: 'unknown' as const }
      : option)
    : sourceOptions;
  const playerChannel = retainingPlayback ? { ...channel, options } : channel;

  useEffect(() => {
    // A finished broadcast, explicit selection, or replacement URL ends this
    // playback session. A later failed check must not resurrect its old player.
    if (playback && (!isLpf || !sameSelection || current?.status === 'ended'
      || (current?.status !== 'unavailable' && current?.iframe !== playback.option.iframe))) {
      setPlayback(undefined);
    }
  }, [isLpf, sameSelection, current?.status, current?.iframe, playback]);

  return (
    <>
      <div className="subheader">
        <div className="page-content subheader__bar">
          <button type="button" className="subheader__back" onClick={onClose} aria-label="Back to channels">←</button>
          <span className="subheader__divider">|</span>
          {channel.logo && <ChannelLogo src={channel.logo} className="channel-bar__logo" size={22} />}
          <span className="channel-bar__name">{channel.name}</span>
          <span className="label channel-bar__count">{pluralize(options.length, 'source')}</span>
        </div>
      </div>

      <div className="split-layout">
        <section className="split-layout__main">
          <ChannelPlayer
            channel={playerChannel}
            initialOptionIndex={optionIndex}
            onOptionChange={onOptionChange}
            lpfRefreshing={lpfRefreshing}
            onPlaybackChange={(index, option, playing) => {
              if (!isLpf) return;
              setPlayback(previous => {
                if (!playing) {
                  return previous?.index === index && previous.option.iframe === option.iframe
                    ? undefined : previous;
                }
                return previous?.channel === channel.name && previous.index === index
                  && previous.option.iframe === option.iframe
                  ? previous : { channel: channel.name, index, option };
              });
            }}
            fillContainer
            hideTabs
          />
        </section>

        <div className="split-layout__aside">
          <div className="channel-sidebar__head">
            <div className="channel-sidebar__title">Channel Sources</div>
          </div>
          {isLpf && (
            <div className="channel-sidebar__refresh">
              <button
                type="button"
                className="link-button"
                disabled={lpfRefreshing}
                onClick={onRefreshLpf}
              >
                {lpfRefreshing ? 'Refreshing links…' : 'Refresh links'}
              </button>
              <div className="channel-sidebar__checked" aria-live="polite">
                {lpfCheckedAt
                  ? <>Last checked <time dateTime={new Date(lpfCheckedAt).toISOString()}>{new Date(lpfCheckedAt).toLocaleTimeString()}</time></>
                  : lpfRefreshing ? 'Checking broadcasts…' : 'Broadcasts not checked yet'}
              </div>
              {(lpfError || retainingPlayback) && (
                <p className="channel-sidebar__error" role="status">
                  {lpfError}
                  {retainingPlayback && <> Current playback is continuing; its link could not be rechecked.</>}
                </p>
              )}
            </div>
          )}
          <div className="channel-sidebar__scroll">
            <div className="channel-sidebar__list">
              {options.map((option, index) => {
                const status = option.status === 'live' && !isLpfCdnUrl(option.iframe)
                  ? 'unknown'
                  : option.status ?? 'unknown';
                const statusLabel = status === 'unknown' && lpfRefreshing
                  ? 'Checking…'
                  : LPF_STATUS_LABELS[status];
                return (
                  <button
                    key={`${channel.name}-${option.name}-${index}`}
                    type="button"
                    className="source-option"
                    aria-pressed={index === optionIndex}
                    onClick={() => onOptionChange(index)}
                  >
                    <div className="source-option__name">{option.name}</div>
                    <div className="source-option__index">Option {index + 1}</div>
                    {isLpf && <div className="source-option__status" data-status={status}>{statusLabel}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
