'use client';

import type { BroadcastChannel, Stream } from '@/types/api';

interface StreamListProps {
  streams: Stream[];
  currentStreamIndex: number | null;
  onSelectStream: (stream: Stream, index: number) => void;
  /** Channels from the local catalog that are broadcasting this match. */
  broadcasts?: BroadcastChannel[];
  selectedChannel?: string | null;
  onSelectChannel?: (channel: BroadcastChannel) => void;
  /** True while sources are still being fetched — distinct from "none exist". */
  isLoading?: boolean;
}

export default function StreamList({
  streams,
  currentStreamIndex,
  onSelectStream,
  broadcasts = [],
  selectedChannel = null,
  onSelectChannel,
  isLoading = false,
}: StreamListProps) {
  const hasStreams = streams.length > 0;
  const hasBroadcasts = broadcasts.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {hasBroadcasts && (
        <div>
          <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>
            On TV
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {broadcasts.map((broadcast) => {
              const isActive = selectedChannel === broadcast.channel;
              return (
                <button
                  key={broadcast.channel}
                  type="button"
                  onClick={() => onSelectChannel?.(broadcast)}
                  aria-label={`Watch on ${broadcast.channel}`}
                  aria-pressed={isActive}
                  style={rowStyle(isActive)}
                >
                  {broadcast.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={broadcast.logo}
                      alt=""
                      width={20}
                      height={20}
                      style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '0.75rem', color: isActive ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                      {broadcast.channel}
                    </span>
                    {broadcast.network !== broadcast.channel && (
                      <span style={{ fontSize: '0.6rem', color: 'var(--subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {broadcast.network}
                      </span>
                    )}
                  </span>
                  <span style={badgeStyle}>{broadcast.options.length} opt</span>
                  {isActive && <span style={playingStyle}>▶</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>
          Available Streams
        </span>

        {isLoading && !hasStreams && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                aria-hidden="true"
                style={{
                  height: '38px',
                  borderRadius: '3px',
                  background: 'var(--bg-2)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  opacity: 0.6,
                }}
              />
            ))}
            <span style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--subtle)', fontFamily: 'var(--font-body)' }}>
              Finding sources…
            </span>
          </div>
        )}

        {!isLoading && !hasStreams && (
          <div style={emptyStyle}>
            {hasBroadcasts
              ? 'No direct streams — use a TV channel above.'
              : 'No streams available for this match'}
          </div>
        )}

        {hasStreams && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {streams.map((stream, index) => {
              const isActive = currentStreamIndex === index && !selectedChannel;

              return (
                <button
                  key={`${stream.embedUrl || stream.url}-${index}`}
                  type="button"
                  onClick={() => onSelectStream(stream, index)}
                  aria-label={`Select ${stream.language || 'stream'} ${stream.quality || ''} from ${stream.source || 'source'}`}
                  aria-pressed={isActive}
                  style={rowStyle(isActive)}
                >
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: isActive ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                      {stream.source || `Stream ${index + 1}`}
                    </span>
                    {stream.quality && <span style={badgeStyle}>{stream.quality}</span>}
                    {stream.language && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>{stream.language}</span>
                    )}
                  </span>

                  {isActive && <span style={playingStyle}>▶ Playing</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function rowStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    textAlign: 'left',
    padding: '0.625rem 0.875rem',
    background: isActive ? 'var(--bg-3)' : 'var(--bg-2)',
    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--line)'}`,
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'all 0.12s',
    borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
  };
}

const badgeStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--subtle)',
  background: 'var(--bg-3)',
  padding: '0.1rem 0.35rem',
  borderRadius: '2px',
  flexShrink: 0,
};

const playingStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  flexShrink: 0,
};

const emptyStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--bg-2)',
  border: '1px solid var(--line)',
  borderRadius: '4px',
  color: 'var(--subtle)',
  fontSize: '0.8rem',
  fontFamily: 'var(--font-body)',
};
