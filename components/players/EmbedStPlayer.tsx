'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { buildHlsConfig } from '@/lib/playerHls';
import PlayerSurface from './PlayerSurface';
import { usePlayerCallbacks } from './usePlayerCallbacks';

interface EmbedStPlayerProps {
  src: string;
  muted?: boolean;
  onPlaying: () => void;
  onError: () => void;
}

/** Stop on fatal errors: selecting the provider's iframe must remain an explicit choice. */
export default function EmbedStPlayer({ src, muted = false, onPlaying, onError }: EmbedStPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { onPlayingRef, onErrorRef } = usePlayerCallbacks(onPlaying, onError);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let hls: Hls | null = null;
    const playing = () => onPlayingRef.current();
    const failed = () => {
      if (cancelled) return;
      hls?.destroy();
      hls = null;
      onErrorRef.current();
    };
    video.addEventListener('playing', playing);
    video.addEventListener('error', failed);
    try {
      if (Hls.isSupported()) {
        hls = new Hls(buildHlsConfig(src));
        hls.on(Hls.Events.ERROR, (_, error) => { if (error.fatal) failed(); });
        hls.on(Hls.Events.MANIFEST_PARSED, () => { void video.play().catch(() => {}); });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        void video.play().catch(() => {});
      } else {
        failed();
      }
    } catch {
      failed();
    }
    return () => {
      cancelled = true;
      video.removeEventListener('playing', playing);
      video.removeEventListener('error', failed);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, onPlayingRef, onErrorRef]);
  return <PlayerSurface videoRef={videoRef} muted={muted} />;
}
