import type { Stream } from '@/types/api';
import StreamPlayer from '@/components/StreamPlayer';
import { findStreamByValue, streamOptionValue, type ActiveMatch } from '@/lib/multiMatch';
import MatchHeading from './MatchHeading';
import { IconClose, IconSpeaker } from './icons';

interface ActiveMatchCardProps {
  active: ActiveMatch;
  onToggleMute: (matchId: string) => void;
  onRemove: (matchId: string) => void;
  onChangeStream: (matchId: string, stream: Stream) => void;
}

export default function ActiveMatchCard({ active, onToggleMute, onRemove, onChangeStream }: ActiveMatchCardProps) {
  const { match, streams, selectedStream, muted } = active;

  return (
    <div className="multi-card">
      <div className="multi-card__header">
        <div className="min-w-0">
          <MatchHeading match={match} truncate liveDot />
        </div>

        <div className="multi-card__actions">
          <button
            type="button"
            className={`multi-icon-btn${muted ? '' : ' multi-icon-btn--active'}`}
            onClick={() => onToggleMute(match.id)}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute this stream' : 'Mute this stream'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            <IconSpeaker muted={muted} />
          </button>
          <button
            type="button"
            className="multi-icon-btn"
            onClick={() => onRemove(match.id)}
            aria-label="Remove this match"
            title="Remove match"
          >
            <IconClose />
          </button>
        </div>
      </div>

      <div className="multi-card__player">
        {selectedStream ? (
          <>
            <StreamPlayer stream={selectedStream} muted={muted} />
            {muted && (
              <div className="multi-card__muted-badge">
                <IconSpeaker muted />
                MUTED
              </div>
            )}
          </>
        ) : (
          <div className="multi-card__no-stream multi-label">No stream available</div>
        )}
      </div>

      {streams.length > 1 && (
        <div className="multi-card__switcher">
          <select
            aria-label="Select stream source"
            className="multi-select multi-select--full"
            value={selectedStream ? streamOptionValue(selectedStream) : ''}
            onChange={(event) => {
              const stream = findStreamByValue(streams, event.target.value);
              if (stream) onChangeStream(match.id, stream);
            }}
          >
            {streams.map((stream, index) => (
              <option key={index} value={streamOptionValue(stream)}>
                {stream.language || 'Unknown'} · {stream.quality || 'SD'}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
