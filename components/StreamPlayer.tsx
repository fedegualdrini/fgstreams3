'use client';

import { useEffect, useRef, useState } from 'react';
import { Stream, StreamStatus } from '@/types/api';
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
  onError 
}: StreamPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!stream?.url && !stream?.embedUrl) {
      setError(true);
      setIsLoading(false);
      if (onError) onError();
      return;
    }

    setError(false);
    setIsLoading(true);

    // Mark stream as being tested
    streamHealthMonitor.updateStatus(streamId, 'unknown', false);
  }, [stream, streamId, onError]);

  const embedUrl = stream?.embedUrl || stream?.url;

  if (!embedUrl) {
    return (
      <div className="video-container bg-black flex items-center justify-center">
        <p className="text-gray-400">No stream available</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-container bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load stream</p>
          {onError && (
            <button
              onClick={onError}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Try Next Stream
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="video-container bg-black relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-gray-400">Loading stream...</div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        className="w-full h-full"
        allowFullScreen
        allow="autoplay; fullscreen; encrypted-media"
        style={{ pointerEvents: muted ? 'none' : 'auto' }}
        onLoad={() => {
          setIsLoading(false);
          streamHealthMonitor.updateStatus(streamId, 'working', true);
          // Try to mute iframe programmatically (may not work due to cross-origin)
          if (muted && iframeRef.current) {
            try {
              const iframe = iframeRef.current;
              if (iframe.contentWindow) {
                // Note: This may fail due to CORS, but we try anyway
                const video = iframe.contentWindow.document?.querySelector('video');
                if (video) {
                  video.muted = true;
                }
              }
            } catch (e) {
              // Cross-origin restrictions - mute state is handled by overlay
            }
          }
        }}
        onError={() => {
          setError(true);
          setIsLoading(false);
          streamHealthMonitor.updateStatus(streamId, 'offline', false);
          if (onError) onError();
        }}
      />
    </div>
  );
}
