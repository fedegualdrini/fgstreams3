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

// ─── API-Football ─────────────────────────────────────────────────────────
// FIFA World Cup 2026 identifiers (league=1, season=2026 per api-football docs).
export const WC_LEAGUE_ID = 1;
export const WC_SEASON = 2026;

// Base URL for the API-Football v3 endpoint.
export const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

// Revalidate windows (seconds) tuned to keep daily calls well under the
// free-plan cap of 100/day. Shared endpoints are warmed by the cron job.
export const AF_REVALIDATE_STANDINGS = 21_600;   // 6h
export const AF_REVALIDATE_FIXTURES = 21_600;    // 6h
export const AF_REVALIDATE_TOPSCORERS = 86_400;  // 24h
export const AF_REVALIDATE_LINEUPS = 86_400;     // 24h (lineups rarely change post-announcement)
export const AF_REVALIDATE_LIVE = 600;           // 10min for live events/stats
export const AF_REVALIDATE_STATIC = 86_400;      // 24h for h2h/predictions

// Free plan: 100 requests/day. Warn in logs once a single runtime instance
// observes this many calls (observability only — the Data Cache is the guard).
export const AF_DAILY_WARN_THRESHOLD = 80;

// Stream status display config
export const STREAM_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  working:  { color: '#22c55e', label: 'Live'     },
  unstable: { color: '#f59e0b', label: 'Unstable' },
  offline:  { color: '#ef4444', label: 'Offline'  },
  unknown:  { color: '#6b7280', label: 'Unknown'  },
};
