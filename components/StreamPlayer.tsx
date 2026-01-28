'use client';

import { useEffect, useRef, useState } from 'react';
import type { Stream } from '@/types/api';
import { streamHealthMonitor } from '@/lib/streamHealth';

interface StreamPlayerProps {
  stream: Stream | null;
  streamId: string;
  autoPlay?: boolean;
  muted?: boolean;
  onError?: () => void;
}

export default function StreamPlayer({
  stream,
  streamId,
  autoPlay = true,
  muted = false,
  onError,
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
  }, [stream, streamId, onError]);

  const embedUrl = stream?.embedUrl || stream?.url;

  if (!embedUrl) {
    return (
      <div className="video-container flex items-center justify-center text-gray-400">
        No stream available
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-container flex flex-col items-center justify-center gap-4 bg-gray-900 text-gray-400">
        <p>Failed to load stream</p>
        {onError && (
          <button
            onClick={onError}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Next Stream
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="video-container relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-gray-400 z-10">
          Loading stream...
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Stream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full border-none"
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
