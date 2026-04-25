// API revalidation windows (seconds)
export const REVALIDATE_MATCHES = 30;
export const REVALIDATE_STREAMS = 60;
export const REVALIDATE_SPORTS = 3600;

// Stream health thresholds
export const HEALTH_CHECK_INTERVAL_MS = 30_000;
export const HEALTH_RECOVERY_INTERVAL_MS = 60_000;
export const HEALTH_OFFLINE_ERROR_THRESHOLD = 2;

// Score polling intervals (ms)
export const SCORES_POLL_INTERVAL_MS = 45_000;
export const FIXTURE_POLL_INTERVAL_MS = 30_000;

// Player load timeout durations (ms)
// After this delay with no iframe onLoad, the player treats the stream as failed.
export const STREAM_LOAD_TIMEOUT_MS = 10_000;
export const CHANNEL_LOAD_TIMEOUT_MS = 15_000;

// Score API route: deduplication window to avoid hammering flashscore on cold-start bursts
export const SCORE_DEDUP_WINDOW_MS = 25_000;
// Entries older than this are pruned from the module-level cache to prevent unbounded growth
export const SCORE_CACHE_MAX_AGE_MS = 120_000;

// Stream status display config
export const STREAM_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  working:  { color: '#22c55e', label: 'Live'     },
  unstable: { color: '#f59e0b', label: 'Unstable' },
  offline:  { color: '#ef4444', label: 'Offline'  },
  unknown:  { color: '#6b7280', label: 'Unknown'  },
};
