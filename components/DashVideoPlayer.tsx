'use client';

import { useEffect, useRef } from 'react';
import type shaka from 'shaka-player/dist/shaka-player.compiled.js';
import PlayerSurface from '@/components/players/PlayerSurface';
import { usePlayerCallbacks } from '@/components/players/usePlayerCallbacks';

interface DashVideoPlayerProps {
  src: string;
  /** ClearKey material as { kidHex: keyHex }; omitted for unencrypted MPDs. */
  clearKeys?: Record<string, string>;
  onPlaying: () => void;
  onError: () => void;
}

const STREAMING_CONFIG = {
  bufferingGoal: 30,
  rebufferingGoal: 4,
  retryParameters: { maxAttempts: 4 },
};

/** shaka's `error` event carries its `shaka.util.Error` in `detail`; the compiled typings only expose a bare Event. */
interface ShakaErrorEvent extends Event {
  detail?: shaka.util.Error;
}

export default function DashVideoPlayer({ src, clearKeys, onPlaying, onError }: DashVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { onPlayingRef, onErrorRef } = usePlayerCallbacks(onPlaying, onError);

  // Serialised so a new object identity with the same keys does not reload the
  // player on every parent render.
  const keySignature = clearKeys ? JSON.stringify(clearKeys) : '';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let player: shaka.Player | null = null;

    const setup = async () => {
      // Loaded on demand: shaka is heavy and only DASH channels need it.
      const engine = (await import('shaka-player/dist/shaka-player.compiled.js')).default;
      if (destroyed) return;

      engine.polyfill.installAll();
      if (!engine.Player.isBrowserSupported()) {
        onErrorRef.current();
        return;
      }

      const instance = new engine.Player();
      player = instance;
      await instance.attach(video);
      if (destroyed) return;

      const clearKeyConfig: Record<string, string> | null = keySignature ? JSON.parse(keySignature) : null;
      instance.configure({
        drm: clearKeyConfig ? { clearKeys: clearKeyConfig } : {},
        streaming: STREAMING_CONFIG,
      });

      instance.addEventListener('error', (event) => {
        const { code, category, data } = (event as ShakaErrorEvent).detail ?? {};
        console.warn('[DashVideoPlayer] playback error', { category, code, data: data?.slice(0, 2) });
        if (!destroyed) onErrorRef.current();
      });

      try {
        await instance.load(src);
        if (destroyed) return;
        onPlayingRef.current();
        video.play().catch(() => {});
      } catch (error) {
        console.warn('[DashVideoPlayer] load failed', src, error);
        if (!destroyed) onErrorRef.current();
      }
    };

    setup();

    return () => {
      destroyed = true;
      player?.destroy();
      player = null;
    };
  }, [src, keySignature, onPlayingRef, onErrorRef]);

  return <PlayerSurface videoRef={videoRef} />;
}
