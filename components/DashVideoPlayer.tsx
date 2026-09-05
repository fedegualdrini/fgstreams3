'use client';

import { useEffect, useRef, useState } from 'react';

interface DashVideoPlayerProps {
  src: string;
  /** ClearKey material as { kidHex: keyHex }; omitted for unencrypted MPDs. */
  clearKeys?: Record<string, string>;
  onPlaying: () => void;
  onError: () => void;
}

export default function DashVideoPlayer({ src, clearKeys, onPlaying, onError }: DashVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onPlayingRef = useRef(onPlaying);
  const onErrorRef = useRef(onError);

  const [pipActive, setPipActive] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  useEffect(() => { onPlayingRef.current = onPlaying; }, [onPlaying]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    setPipSupported(typeof document !== 'undefined' && !!document.pictureInPictureEnabled);
  }, []);

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else {
        await video.requestPictureInPicture();
        setPipActive(true);
      }
    } catch {
      // PiP not available for this video
    }
  };

  // Serialised so a new object identity with the same keys does not reload the
  // player on every parent render.
  const keySignature = clearKeys ? JSON.stringify(clearKeys) : '';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let player: any = null; // shaka's compiled bundle ships loose types

    const setup = async () => {
      const shaka = (await import('shaka-player/dist/shaka-player.compiled.js')).default;
      if (destroyed) return;

      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        onErrorRef.current();
        return;
      }

      player = new shaka.Player();
      await player.attach(video);
      if (destroyed) return;

      const keys = keySignature ? JSON.parse(keySignature) : null;
      player.configure({
        drm: keys ? { clearKeys: keys } : {},
        streaming: { bufferingGoal: 30, rebufferingGoal: 4, retryParameters: { maxAttempts: 4 } },
      });

      player.addEventListener('error', (event: { detail?: { code?: number; category?: number; data?: unknown[] } }) => {
        const { code, category, data } = event.detail ?? {};
        console.warn('[DashVideoPlayer] playback error', { category, code, data: data?.slice(0, 2) });
        if (!destroyed) onErrorRef.current();
      });

      try {
        await player.load(src);
        if (destroyed) return;
        onPlayingRef.current();
        video.play().catch(() => {});
      } catch (error) {
        console.warn('[DashVideoPlayer] load failed', src, error);
        if (!destroyed) onErrorRef.current();
      }
    };

    const handleEnterPip = () => setPipActive(true);
    const handleLeavePip = () => setPipActive(false);
    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);

    setup();

    return () => {
      destroyed = true;
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
      if (player) { player.destroy(); player = null; }
    };
  }, [src, keySignature]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000' }}
      />
      {pipSupported && (
        <button
          type="button"
          onClick={togglePip}
          title={pipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
          aria-label={pipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
          style={{
            position: 'absolute', bottom: '48px', right: '8px', zIndex: 10,
            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px', color: '#fff', cursor: 'pointer',
            padding: '4px 8px', fontSize: '0.65rem', fontFamily: 'var(--font-body)',
            fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            backdropFilter: 'blur(4px)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.85)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)'; }}
        >
          {pipActive ? '⊡ Exit PiP' : '⧉ PiP'}
        </button>
      )}
    </div>
  );
}
