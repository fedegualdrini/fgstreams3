'use client';

import { useEffect, useRef } from 'react';
import type Hls from 'hls.js';
import { buildHlsConfig, toProxyUrl } from '@/lib/playerHls';
import PlayerSurface from '@/components/players/PlayerSurface';
import { usePlayerCallbacks } from '@/components/players/usePlayerCallbacks';

interface HLSVideoPlayerProps {
  src: string;
  /** Set for origins that send no CORS header, so hls.js cannot fetch them directly. */
  forceProxy?: boolean;
  onPlaying: () => void;
  onError: () => void;
}

const MAX_NETWORK_RETRIES = 5;
const MAX_MEDIA_RETRIES = 3;
const NETWORK_RETRY_DELAY_MS = 1000;
const NATIVE_HLS_MIME = 'application/vnd.apple.mpegurl';

export default function HLSVideoPlayer({ src, forceProxy = false, onPlaying, onError }: HLSVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { onPlayingRef, onErrorRef } = usePlayerCallbacks(onPlaying, onError);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let hls: Hls | null = null;
    // Tracked separately: a stream that survives 5 network blips is not the same
    // as one that also hit 3 media errors, and a single shared counter that never
    // reset meant later recoverable errors were treated as fatal.
    let networkRetries = 0;
    let mediaRetries = 0;

    const playNatively = () => {
      video.src = toProxyUrl(src, forceProxy);
      video.addEventListener('loadedmetadata', () => {
        if (!destroyed) { video.play().catch(() => {}); onPlayingRef.current(); }
      }, { once: true });
      video.addEventListener('error', () => {
        if (!destroyed) onErrorRef.current();
      }, { once: true });
    };

    const setupHls = async () => {
      // Loaded on demand: hls.js is heavy and only HLS channels need it.
      const { default: HlsEngine } = await import('hls.js');
      if (destroyed) return;

      if (!HlsEngine.isSupported()) {
        if (video.canPlayType(NATIVE_HLS_MIME)) playNatively();
        else onErrorRef.current();
        return;
      }

      const instance = new HlsEngine(buildHlsConfig(src));
      hls = instance;
      instance.loadSource(toProxyUrl(src, forceProxy));
      instance.attachMedia(video);

      instance.on(HlsEngine.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        onPlayingRef.current();
        video.play().catch(() => {});
        if (instance.levels.length > 1) instance.currentLevel = -1;
      });

      // A buffered fragment means the stream is healthy again, so the retry
      // budget resets — otherwise a long session exhausts it and dies on a blip.
      instance.on(HlsEngine.Events.FRAG_BUFFERED, () => {
        networkRetries = 0;
        mediaRetries = 0;
      });

      instance.on(HlsEngine.Events.ERROR, (_event, data) => {
        if (!data.fatal || destroyed) return;

        if (data.type === HlsEngine.ErrorTypes.NETWORK_ERROR && networkRetries < MAX_NETWORK_RETRIES) {
          networkRetries++;
          setTimeout(() => { if (!destroyed && hls) hls.startLoad(); }, NETWORK_RETRY_DELAY_MS);
          return;
        }

        if (data.type === HlsEngine.ErrorTypes.MEDIA_ERROR && mediaRetries < MAX_MEDIA_RETRIES) {
          mediaRetries++;
          instance.recoverMediaError();
          return;
        }

        instance.destroy();
        hls = null;
        onErrorRef.current();
      });
    };

    setupHls();

    return () => {
      destroyed = true;
      hls?.destroy();
      hls = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [src, forceProxy, onPlayingRef, onErrorRef]);

  return <PlayerSurface videoRef={videoRef} />;
}
