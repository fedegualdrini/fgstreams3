import type { Channel } from '@/types/channels';
import { getPlayableOptions, pluralize } from '@/lib/channelOptions';
import ChannelPlayer from '@/components/ChannelPlayer';
import ChannelLogo from './ChannelLogo';

interface ChannelViewerProps {
  channel: Channel;
  optionIndex: number;
  onOptionChange: (index: number) => void;
  onClose: () => void;
}

/** A channel playing full-width, with a header bar and a sidebar of its sources. */
export default function ChannelViewer({ channel, optionIndex, onOptionChange, onClose }: ChannelViewerProps) {
  const options = getPlayableOptions(channel);

  return (
    <>
      <div className="channel-bar">
        <div className="page-content channel-bar__inner">
          <button type="button" className="channel-bar__back" onClick={onClose} aria-label="Back to channels">←</button>
          <span className="channel-bar__divider">|</span>
          {channel.logo && <ChannelLogo src={channel.logo} className="channel-bar__logo" size={22} />}
          <span className="channel-bar__name">{channel.name}</span>
          <span className="label channel-bar__count">{pluralize(options.length, 'source')}</span>
        </div>
      </div>

      <div className="detail-layout channel-layout">
        <section className="detail-player channel-stage">
          <ChannelPlayer
            channel={channel}
            initialOptionIndex={optionIndex}
            onOptionChange={onOptionChange}
            fillContainer
            hideTabs
          />
        </section>

        <div className="detail-sidebar channel-sidebar">
          <div className="channel-sidebar__head">
            <div className="channel-sidebar__title">Channel Sources</div>
          </div>
          <div className="channel-sidebar__scroll">
            <div className="channel-sidebar__list">
              {options.map((option, index) => (
                <button
                  key={`${channel.name}-${option.name}-${index}`}
                  type="button"
                  className="source-option"
                  aria-pressed={index === optionIndex}
                  onClick={() => onOptionChange(index)}
                >
                  <div className="source-option__name">{option.name}</div>
                  <div className="source-option__index">Option {index + 1}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
