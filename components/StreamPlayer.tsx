'use client';

import { useEffect, useRef, useState } from 'react';
import type { Stream } from '@/types/api';
import { streamHealthMonitor } from '@/lib/streamHealth';
import Spinner from '@/components/Spinner';

interface StreamPlayerProps {
  stream: Stream | null;
  streamId: string;
  autoPlay?: boolean;
  muted?: boolean;
  onError?: () => void;
  fillParent?: boolean;
}

export default function StreamPlayer({
  stream,
  streamId,
  autoPlay = true,
  muted = false,
  onError,
  fillParent = false,
}: StreamPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!stream?.url && !stream?.embedUrl) {
      setError(true);
      setIsLoading(false);
      onError?.();
      return;
    }
    setError(false);
    setIsLoading(true);
    streamHealthMonitor.updateStatus(streamId, 'unknown', false);
    const loadTimeout = setTimeout(() => {
      setError(true);
      setIsLoading(false);
      onError?.();
    }, 10_000);
    return () => clearTimeout(loadTimeout);
  }, [stream, streamId, onError]);

  const embedUrl = stream?.embedUrl || stream?.url;

  const stateContainerClass = fillParent ? undefined : 'video-container';
  const stateContainerStyle = fillParent ? { width: '100%', height: '100%' } : {};

  if (!embedUrl) {
    return (
      <div className={stateContainerClass} style={{ ...stateContainerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
        No stream available
      </div>
    );
  }

  if (error) {
    return (
      <div className={stateContainerClass} style={{ ...stateContainerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
          {stream?.embedUrl ? 'Stream failed to load — the embed may be unavailable.' : 'No playable stream URL.'}
        </p>
        {onError && (
          <button
            aria-label="Try next stream"
            onClick={onError}
            style={{ padding: '0.5rem 1.25rem', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', cursor: 'pointer' }}
          >
            Try next stream
          </button>
        )}
      </div>
    );
  }

  const containerStyle = fillParent
    ? { position: 'relative' as const, width: '100%', height: '100%' }
    : { position: 'relative' as const };

  return (
    <div className={fillParent ? undefined : 'video-container'} style={containerStyle}>
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', zIndex: 10 }}>
          <Spinner label="Loading stream…" />
        </div>
      )}
      <iframe
        key={embedUrl}
        ref={iframeRef}
        src={embedUrl}
        title="Stream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        onLoad={() => {
          setIsLoading(false);
          streamHealthMonitor.updateStatus(streamId, 'working', true);
          if (muted && iframeRef.current?.contentWindow?.document) {
            try {
              const video = iframeRef.current.contentWindow.document.querySelector('video');
              if (video) video.muted = true;
            } catch {
              /* cross-origin */
            }
          }
        }}
        onError={() => {
          setError(true);
          setIsLoading(false);
          streamHealthMonitor.updateStatus(streamId, 'offline', false);
          onError?.();
        }}
      />
    </div>
  );
}
