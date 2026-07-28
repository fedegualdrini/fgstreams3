// API revalidation windows (seconds)
export const REVALIDATE_MATCHES = 30;
export const REVALIDATE_STREAMS = 60;
export const REVALIDATE_SPORTS = 3600;

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
