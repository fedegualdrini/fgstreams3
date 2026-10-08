import type { HlsConfig } from 'hls.js';

/** Origins with slow, bursty delivery: they get a deeper buffer and a cautious ABR. */
const SLOW_ORIGIN_IPS = [
  '45.5.151.147',
  '190.61.41.181',
  '138.59.227.20',
  '177.74.205.189',
  '201.217.246.42',
  '191.97.59.33',
];

const BASE_CONFIG: Partial<HlsConfig> = {
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

const SLOW_ORIGIN_OVERRIDES: Partial<HlsConfig> = {
  maxBufferLength: 90,
  maxMaxBufferLength: 180,
  maxBufferSize: 200 * 1000 * 1000,
  abrBandWidthFactor: 0.8,
};

export function buildHlsConfig(src: string): Partial<HlsConfig> {
  const isSlowOrigin = SLOW_ORIGIN_IPS.some(ip => src.includes(ip));
  return isSlowOrigin ? { ...BASE_CONFIG, ...SLOW_ORIGIN_OVERRIDES } : BASE_CONFIG;
}

/** Plain-http streams (mixed content) and no-CORS origins are fetched via the server proxy. */
export function toProxyUrl(url: string, forceProxy: boolean): string {
  return forceProxy || url.startsWith('http://')
    ? `/api/hls-proxy?url=${encodeURIComponent(url)}`
    : url;
}
