'use client';

import { useEffect, useRef, useState } from 'react';
import type { Stream } from '@/types/api';
import { streamHealthMonitor, streamKeyFor } from '@/lib/streamHealth';
import { STREAM_LOAD_TIMEOUT_MS, HEALTH_WORKING_DWELL_MS } from '@/lib/constants';
import Spinner from '@/components/Spinner';

interface StreamPlayerProps {
  stream: Stream | null;
  autoPlay?: boolean;
  muted?: boolean;
  onError?: () => void;
  fillParent?: boolean;
}

export default function StreamPlayer({
  stream,
  autoPlay = true,
  muted = false,
  onError,
  fillParent = false,
}: StreamPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Health is keyed off the URL actually loaded, so the same embed is tracked
  // identically here, in the sidebar list, and in multi-stream view.
  const streamId = streamKeyFor(stream);

  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to onError so the load-timeout effect doesn't re-run
  // (and restart the 10s countdown) whenever the callback reference changes.
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  useEffect(() => {
    if (!stream?.url && !stream?.embedUrl) {
      setError(true);
      setIsLoading(false);
      onErrorRef.current?.();
      return;
    }
    setError(false);
    setIsLoading(true);
    loadTimeoutRef.current = setTimeout(() => {
      setError(true);
      setIsLoading(false);
      // A stream that never fires onLoad is a real observed failure — record it
      // so it sinks below untested streams in selectBestStream.
      streamHealthMonitor.reportFailed(streamId, 'timeout');
      onErrorRef.current?.();
    }, STREAM_LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      // Leaving before the dwell threshold records nothing — absence of proof
      // is not proof of failure.
      if (dwellTimeoutRef.current) clearTimeout(dwellTimeoutRef.current);
    };
  }, [stream, streamId]); // onError intentionally excluded — use onErrorRef instead

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
          if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
          setIsLoading(false);
          // onLoad only proves the embed document loaded (it fires for error
          // pages too), so this is "unstable" until playback is sustained.
          streamHealthMonitor.reportLoaded(streamId);
          if (dwellTimeoutRef.current) clearTimeout(dwellTimeoutRef.current);
          dwellTimeoutRef.current = setTimeout(() => {
            streamHealthMonitor.reportSustained(streamId);
          }, HEALTH_WORKING_DWELL_MS);
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
          if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
          if (dwellTimeoutRef.current) clearTimeout(dwellTimeoutRef.current);
          setError(true);
          setIsLoading(false);
          streamHealthMonitor.reportFailed(streamId, 'error');
          onErrorRef.current?.();
        }}
      />
    </div>
  );
}
