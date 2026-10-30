'use client';

import { useEffect, useRef } from 'react';
import type Hls from 'hls.js';
import { buildHlsConfig } from '@/lib/playerHls';
import type { DirectProvider } from '@/lib/directPlayback';
import PlayerSurface from './PlayerSurface';
import { usePlayerCallbacks } from './usePlayerCallbacks';

interface DirectHlsPlayerProps {
  src: string;
  provider: DirectProvider;
  muted?: boolean;
  onPlaying: () => void;
  onRecovering: (attempt: number) => void;
  onError: () => void;
}

const MAX_NETWORK_RESTARTS = 3;
const RESTART_DELAY_MS = 2_000;
const STABLE_PLAYBACK_SECONDS = 60;

/** Restart the same source on network failure; iframe/source changes remain explicit. */
export default function DirectHlsPlayer({ src, provider, muted = false, onPlaying, onRecovering, onError }: DirectHlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { onPlayingRef, onErrorRef } = usePlayerCallbacks(onPlaying, onError);
  const onRecoveringRef = useRef(onRecovering);
  useEffect(() => { onRecoveringRef.current = onRecovering; }, [onRecovering]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let stopped = false;
    let hls: Hls | null = null;
    let retryTimer: number | undefined;
    let restarts = 0;
    let startId = 0;
    // Load the browser SDK only after this direct player mounts, not during SSR.
    const sdk = import('hls.js');
    let stableSince: number | null = null;

    const destroyEngine = () => {
      startId++;
      const previous = hls;
      hls = null;
      previous?.destroy();
      if (video.hasAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
    };
    const interrupted = () => { stableSince = null; };
    const playing = () => {
      if (cancelled || stopped || retryTimer !== undefined) return;
      stableSince = video.currentTime;
      onPlayingRef.current();
    };
    const progress = () => {
      if (stableSince !== null && !video.paused && !video.seeking &&
          video.readyState >= 3 && video.currentTime - stableSince >= STABLE_PLAYBACK_SECONDS) {
        restarts = 0;
        stableSince = null;
      }
    };
    const failed = () => {
      if (cancelled || stopped) return;
      stopped = true;
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
      interrupted();
      destroyEngine();
      onErrorRef.current();
    };
    const reconnect = () => {
      if (cancelled || stopped || retryTimer !== undefined) return;
      if (restarts >= MAX_NETWORK_RESTARTS) { failed(); return; }
      interrupted();
      const delay = RESTART_DELAY_MS * 2 ** restarts++;
      // Set the guard before teardown: duplicate errors must not spend another attempt.
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        if (!cancelled && !stopped) start();
      }, delay);
      destroyEngine();
      onRecoveringRef.current(restarts);
    };
    const videoFailed = () => {
      if (retryTimer !== undefined) return;
      // Native HLS exposes network failures as MEDIA_ERR_NETWORK (2).
      if (video.error?.code === 2) reconnect();
      else failed();
    };
    const start = async () => {
      const id = ++startId;
      try {
        const { default: HlsEngine } = await sdk;
        if (cancelled || stopped || retryTimer !== undefined || id !== startId) return;
        if (HlsEngine.isSupported()) {
          const config = buildHlsConfig(src);
          // Embed-st alone needs its browser segment normalizer; keep it out of StreamFree.
          const embedStLoader = provider === 'embed-st' ? await import('@/lib/embedStHls') : null;
          if (cancelled || stopped || retryTimer !== undefined || id !== startId) return;
          const instance = new HlsEngine(embedStLoader
            ? { ...config, loader: embedStLoader.createEmbedStLoader() }
            : config);
          hls = instance;
          instance.on(HlsEngine.Events.ERROR, (_, error) => {
            if (cancelled || stopped || hls !== instance || !error.fatal) return;
            if (error.type === HlsEngine.ErrorTypes.NETWORK_ERROR) reconnect();
            else failed();
          });
          instance.on(HlsEngine.Events.MANIFEST_PARSED, () => {
            if (!cancelled && !stopped && hls === instance) void video.play().catch(() => {});
          });
          instance.loadSource(src);
          instance.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
          void video.play().catch(() => {});
        } else {
          failed();
        }
      } catch {
        if (id === startId && retryTimer === undefined) failed();
      }
    };
    video.addEventListener('playing', playing);
    video.addEventListener('timeupdate', progress);
    video.addEventListener('waiting', interrupted);
    video.addEventListener('pause', interrupted);
    video.addEventListener('seeking', interrupted);
    video.addEventListener('error', videoFailed);
    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      video.removeEventListener('playing', playing);
      video.removeEventListener('timeupdate', progress);
      video.removeEventListener('waiting', interrupted);
      video.removeEventListener('pause', interrupted);
      video.removeEventListener('seeking', interrupted);
      video.removeEventListener('error', videoFailed);
      destroyEngine();
    };
  }, [src, provider, onPlayingRef, onErrorRef, onRecoveringRef]);
  return <PlayerSurface videoRef={videoRef} muted={muted} />;
}
