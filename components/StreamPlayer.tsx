'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stream } from '@/types/api';
import { STREAM_LOAD_TIMEOUT_MS } from '@/lib/constants';
import Spinner from '@/components/Spinner';

interface StreamPlayerProps {
  stream: Stream | null;
  muted?: boolean;
  onError?: () => void;
  fillParent?: boolean;
}

/** Best effort: only same-origin embeds expose their <video>. */
function muteEmbeddedVideo(iframe: HTMLIFrameElement | null) {
  try {
    const video = iframe?.contentWindow?.document.querySelector('video');
    if (video) video.muted = true;
  } catch {
    // Cross-origin embed.
  }
}

export default function StreamPlayer({
  stream,
  muted = false,
  onError,
  fillParent = false,
}: StreamPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimeoutRef = useRef<number | undefined>(undefined);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Read onError through a ref so the load-timeout effect doesn't re-run (and
  // restart the countdown) whenever the callback's identity changes.
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  const fail = useCallback(() => {
    setError(true);
    setIsLoading(false);
    onErrorRef.current?.();
  }, []);

  const embedUrl = stream?.embedUrl || stream?.url;

  useEffect(() => {
    if (!embedUrl) {
      fail();
      return;
    }
    setError(false);
    setIsLoading(true);
    loadTimeoutRef.current = window.setTimeout(fail, STREAM_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(loadTimeoutRef.current);
  }, [stream, embedUrl, fail]);

  // Aspect-ratio box by default; fills the parent when the page owns the sizing.
  const frameClass = fillParent ? 'stream-player--fill' : 'video-container';

  if (!embedUrl) {
    return <div className={`${frameClass} stream-player__state`}>No stream available</div>;
  }

  if (error) {
    return (
      <div className={`${frameClass} stream-player__state stream-player__state--error`}>
        <p>{stream?.embedUrl ? 'Stream failed to load — the embed may be unavailable.' : 'No playable stream URL.'}</p>
        {onError && (
          <button type="button" className="btn btn--primary" aria-label="Try next stream" onClick={onError}>
            Try next stream
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={frameClass}>
      {isLoading && (
        <div className="stream-player__loading">
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
        className="stream-player__frame"
        onLoad={() => {
          window.clearTimeout(loadTimeoutRef.current);
          setIsLoading(false);
          if (muted) muteEmbeddedVideo(iframeRef.current);
        }}
        onError={() => {
          window.clearTimeout(loadTimeoutRef.current);
          fail();
        }}
      />
    </div>
  );
}
