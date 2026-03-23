'use client';

import type { Stream, StreamStatus } from '@/types/api';
import { streamHealthMonitor } from '@/lib/streamHealth';
import { STREAM_STATUS_CONFIG } from '@/lib/constants';

interface StreamListProps {
  streams: Stream[];
  currentStreamId: string | null;
  onSelectStream: (stream: Stream, index: number) => void;
}

export default function StreamList({ streams, currentStreamId, onSelectStream }: StreamListProps) {
  if (!streams?.length) {
    return (
      <div style={{
        padding: '1rem',
        background: 'var(--bg-2)',
        border: '1px solid var(--line)',
        borderRadius: '4px',
        color: 'var(--subtle)',
        fontSize: '0.8rem',
        fontFamily: 'var(--font-body)',
      }}>
        No streams available for this match
      </div>
    );
  }

  return (
    <div>
      <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>Available Streams</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {streams.map((stream, index) => {
          const streamId = `${stream.source || 'unknown'}-${index}`;
          const isActive = currentStreamId === streamId;
          const health = streamHealthMonitor.getStatus(streamId);

          return (
            <button
              key={streamId}
              type="button"
              onClick={() => onSelectStream(stream, index)}
              style={{
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
              }}
            >
              {/* Status dot */}
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: STREAM_STATUS_CONFIG[health.status]?.color ?? '#6b7280',
                flexShrink: 0,
              }} />

              {/* Info */}
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: isActive ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                  {STREAM_STATUS_CONFIG[health.status]?.label ?? 'Unknown'}
                </span>
                {stream.quality && (
                  <span style={{
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--subtle)',
                    background: 'var(--bg-3)',
                    padding: '0.1rem 0.35rem',
                    borderRadius: '2px',
                  }}>
                    {stream.quality}
                  </span>
                )}
                {stream.language && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>{stream.language}</span>
                )}
                {stream.source && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{stream.source}</span>
                )}
              </span>

              {isActive && (
                <span style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  flexShrink: 0,
                }}>
                  ▶ Playing
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
