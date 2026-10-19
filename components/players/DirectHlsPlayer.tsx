'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { buildHlsConfig } from '@/lib/playerHls';
import { createEmbedStLoader } from '@/lib/embedStHls';
import { streamTpResolvePath, validateStreamTpManifest } from '@/lib/streamTp';
import PlayerSurface from './PlayerSurface';
import { usePlayerCallbacks } from './usePlayerCallbacks';

interface DirectHlsPlayerProps {
  provider: 'embed-st' | 'streamtp';
  src: string;
  muted?: boolean;
  onPlaying: () => void;
  onRecovering: (attempt: number) => void;
  onError: () => void;
}

const MAX_NETWORK_RESTARTS = 3;
const RESTART_DELAY_MS = 2_000;
const STABLE_PLAYBACK_SECONDS = 60;
const SOURCE_RESOLVE_TIMEOUT_MS = 20_000;

/** Restart the same source on network failure; iframe/source changes remain explicit. */
export default function DirectHlsPlayer({ provider, src, muted = false, onPlaying, onRecovering, onError }: DirectHlsPlayerProps) {
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
    let resolving: AbortController | null = null;
    let retryTimer: number | undefined;
    let resolveTimer: number | undefined;
    let restarts = 0;
    let stableSince: number | null = null;

    const destroyEngine = () => {
      resolving?.abort();
      resolving = null;
      window.clearTimeout(resolveTimer);
      resolveTimer = undefined;
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
      try {
        let mediaSrc = src;
        if (provider === 'streamtp') {
          const controller = new AbortController();
          resolving = controller;
          resolveTimer = window.setTimeout(() => controller.abort(), SOURCE_RESOLVE_TIMEOUT_MS);
          const response = await fetch(streamTpResolvePath(src), {
            signal: controller.signal, cache: 'no-store',
          });
          if (cancelled || stopped || resolving !== controller) return;
          if (!response.ok) { failed(); return; }
          const metadata: { url?: unknown } = await response.json();
          if (cancelled || stopped || resolving !== controller) return;
          mediaSrc = validateStreamTpManifest(metadata.url);
          window.clearTimeout(resolveTimer);
          resolveTimer = undefined;
          resolving = null;
        }
        if (Hls.isSupported()) {
          const config = { ...buildHlsConfig(mediaSrc) };
          if (provider === 'embed-st') config.loader = createEmbedStLoader();
          const instance = new Hls(config);
          hls = instance;
          instance.on(Hls.Events.ERROR, (_, error) => {
            if (cancelled || stopped || hls !== instance || !error.fatal) return;
            if (error.type === Hls.ErrorTypes.NETWORK_ERROR) reconnect();
            else failed();
          });
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled && !stopped && hls === instance) void video.play().catch(() => {});
          });
          instance.loadSource(mediaSrc);
          instance.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = mediaSrc;
          void video.play().catch(() => {});
        } else {
          failed();
        }
      } catch {
        failed();
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
  }, [provider, src, onPlayingRef, onErrorRef, onRecoveringRef]);
  return <PlayerSurface videoRef={videoRef} muted={muted} />;
}
