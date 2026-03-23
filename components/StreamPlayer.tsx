'use client';

import { useEffect, useRef, useState } from 'react';
import type { Stream } from '@/types/api';
import { streamHealthMonitor } from '@/lib/streamHealth';

const EMBED_REFRESH_INTERVAL = 3 * 60 * 1000; // 3 minutes — resets pooembed.eu session before JW Player's ~4-min refresh cycle triggers 403
const VISIBILITY_REFRESH_MIN_GAP = 30 * 1000; // only refresh on tab-return if ≥30s since last load

interface StreamPlayerProps {
  stream: Stream | null;
  streamId: string;
  autoPlay?: boolean;
  muted?: boolean;
  onError?: () => void;
  fillContainer?: boolean;
}

export default function StreamPlayer({
  stream,
  streamId,
  autoPlay = true,
  muted = false,
  onError,
  fillContainer = false,
}: StreamPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastLoadTime = useRef<number>(Date.now());

  const triggerRefresh = () => {
    setIsRefreshing(true);
    setIframeKey(k => k + 1);
  };

  useEffect(() => {
    if (!stream?.url && !stream?.embedUrl) {
      setError(true);
      setIsLoading(false);
      onError?.();
      return;
    }
    setError(false);
    setIsLoading(true);
    setIframeKey(0);
    streamHealthMonitor.updateStatus(streamId, 'unknown', false);

    // Proactive token refresh — prevents pooembed.eu 403 before JW Player's ~4-min internal refresh
    const interval = setInterval(triggerRefresh, EMBED_REFRESH_INTERVAL);

    // Stall recovery — reload when user returns to tab after the stream may have stalled
    const handleVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastLoadTime.current >= VISIBILITY_REFRESH_MIN_GAP) {
        triggerRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [stream, streamId, onError]);

  const embedUrl = stream?.embedUrl || stream?.url;

  const stateContainerClass = fillContainer ? undefined : 'video-container';
  const stateContainerStyle = fillContainer ? { width: '100%', height: '100%' } : {};

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
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>Failed to load stream</p>
        {onError && (
          <button
            onClick={onError}
            style={{ padding: '0.5rem 1.25rem', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', cursor: 'pointer' }}
          >
            Try next stream
          </button>
        )}
      </div>
    );
  }

  const containerStyle = fillContainer
    ? { position: 'relative' as const, width: '100%', height: '100%' }
    : { position: 'relative' as const };

  return (
    <div className={fillContainer ? undefined : 'video-container'} style={containerStyle}>
      {isLoading && !isRefreshing && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', zIndex: 10, flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>Loading stream…</span>
        </div>
      )}
      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={embedUrl}
        title="Stream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        onLoad={() => {
          setIsLoading(false);
          setIsRefreshing(false);
          lastLoadTime.current = Date.now();
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
