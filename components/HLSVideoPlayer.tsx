'use client';

import { useEffect, useRef } from 'react';
import type { ErrorData } from 'hls.js';

interface HLSVideoPlayerProps {
  src: string;
  onPlaying: () => void;
  onError: () => void;
}

const EXTERNAL_IPS = [
  '45.5.151.147',
  '190.61.41.181',
  '138.59.227.20',
  '177.74.205.189',
  '201.217.246.42',
  '191.97.59.33',
];

const BASE_CONFIG = {
  maxBufferLength: 45,
  maxMaxBufferLength: 90,
  maxBufferSize: 120 * 1000 * 1000,
  maxBufferHole: 1.5,
  highBufferWatchdogPeriod: 5,
  enableWorker: true,
  abrEwmaDefaultEstimate: 5000,
  abrEwmaFastLive: 1,
  abrEwmaSlowLive: 3,
  abrBandWidthFactor: 1.2,
  abrBandWidthUpFactor: 1.5,
  nudgeMaxRetry: 8,
  nudgeOffset: 0.05,
  fragLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 500,
  fragLoadingMaxRetryTimeout: 12000,
  manifestLoadingMaxRetry: 4,
  manifestLoadingRetryDelay: 500,
  manifestLoadingTimeOut: 10000,
  levelLoadingMaxRetry: 4,
  levelLoadingRetryDelay: 500,
  backBufferLength: 60,
  fragLoadingTimeOut: 20000,
  xhrSetup: (xhr: XMLHttpRequest) => { xhr.withCredentials = false; },
};

const MAX_NETWORK_RETRIES = 5;
const MAX_MEDIA_RETRIES = 3;

function toProxyUrl(url: string): string {
  return url.startsWith('http://')
    ? `/api/hls-proxy?url=${encodeURIComponent(url)}`
    : url;
}

export default function HLSVideoPlayer({ src, onPlaying, onError }: HLSVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onPlayingRef = useRef(onPlaying);
  const onErrorRef = useRef(onError);

  useEffect(() => { onPlayingRef.current = onPlaying; }, [onPlaying]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let networkRetries = 0;
    let mediaRetries = 0;

    type HlsClass = Awaited<typeof import('hls.js')>['default'];
    type HlsInstance = InstanceType<HlsClass>;
    let hlsInstance: HlsInstance | null = null;

    const isExternal = EXTERNAL_IPS.some(ip => src.includes(ip));
    const config = isExternal
      ? { ...BASE_CONFIG, maxBufferLength: 90, maxMaxBufferLength: 180, maxBufferSize: 200 * 1000 * 1000, abrBandWidthFactor: 0.8 }
      : BASE_CONFIG;

    const setupHls = async () => {
      const HlsModule = await import('hls.js');
      const Hls = HlsModule.default;

      if (destroyed) return;

      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = toProxyUrl(src);
          video.addEventListener('loadedmetadata', () => {
            if (!destroyed) { video.play().catch(() => {}); onPlayingRef.current(); }
          }, { once: true });
          video.addEventListener('error', () => {
            if (!destroyed) onErrorRef.current();
          }, { once: true });
        } else {
          onErrorRef.current();
        }
        return;
      }

      hlsInstance = new Hls(config);
      // Capture a stable non-null reference for use inside event callbacks.
      // hlsInstance may be set to null in the destroy path, but hls never will.
      const hls = hlsInstance;
      hls.loadSource(toProxyUrl(src));
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        onPlayingRef.current();
        video.play().catch(() => {});
        if (hls.levels && hls.levels.length > 1) {
          hls.currentLevel = -1;
        }
      });

      hls.on(Hls.Events.ERROR, (_: unknown, data: ErrorData) => {
        if (!data.fatal || destroyed) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < MAX_NETWORK_RETRIES) {
          networkRetries++;
          setTimeout(() => { if (!destroyed && hlsInstance) hlsInstance.startLoad(); }, 1000);
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < MAX_MEDIA_RETRIES) {
          mediaRetries++;
          hls.recoverMediaError();
          return;
        }

        hls.destroy();
        hlsInstance = null;
        if (!destroyed) onErrorRef.current();
      });
    };

    setupHls();

    return () => {
      destroyed = true;
      if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      controls
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000' }}
    />
  );
}
