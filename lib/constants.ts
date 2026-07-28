import type { StreamStatus } from '@/types/api';

// API revalidation windows (seconds)
export const REVALIDATE_MATCHES = 30;
export const REVALIDATE_STREAMS = 60;
export const REVALIDATE_SPORTS = 3600;

// Stream health thresholds
// Consecutive observed failures before a stream is considered offline.
export const HEALTH_OFFLINE_ERROR_THRESHOLD = 2;
// A stream must keep playing this long after load before it counts as "working".
// Anything shorter is only evidence the embed document loaded, not that it plays.
export const HEALTH_WORKING_DWELL_MS = 20_000;
// Entries older than this are treated as "unknown" rather than reported stale.
export const HEALTH_ENTRY_TTL_MS = 600_000;
// Upper bound on stored entries; oldest are evicted first.
export const HEALTH_MAX_ENTRIES = 200;

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
export const STREAM_STATUS_CONFIG: Record<StreamStatus, { color: string; label: string }> = {
  working:  { color: '#22c55e', label: 'Live'     },
  unstable: { color: '#f59e0b', label: 'Unstable' },
  offline:  { color: '#ef4444', label: 'Offline'  },
  unknown:  { color: '#6b7280', label: 'Untested' },
};
