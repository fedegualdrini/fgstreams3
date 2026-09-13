// API revalidation windows (seconds)
export const REVALIDATE_MATCHES = 30;
export const REVALIDATE_STREAMS = 60;
export const REVALIDATE_SPORTS = 3600;

// How long a fully resolved match catalog (matches + their playable streams)
// stays fresh. Next serves the stale catalog while rebuilding in the
// background, so only the very first request after a deploy pays full price.
export const REVALIDATE_CATALOG = 60;

// Promiedos broadcast data changes slowly — a fixture's TV network is set days
// ahead — so it is cached far longer than live match data.
export const REVALIDATE_BROADCASTS = 900;
// Broadcast data is optional, so it gets a short leash: a slow upstream must
// never hold up a render.
export const PROMIEDOS_TIMEOUT_MS = 6_000;
export const ANGULISMO_TIMEOUT_MS = 6_000;

// The angulismo feed carries today's and tomorrow's fixtures with live stream
// URLs, so it is refreshed more eagerly than the Promiedos broadcaster list.
export const REVALIDATE_ANGULISMO = 600;

// Catalog build limits. 64 parallel requests resolve ~470 stream endpoints in
// under 3s; the budget caps a slow upstream so a render can never hang.
export const CATALOG_CONCURRENCY = 64;
export const CATALOG_TIME_BUDGET_MS = 8_000;

// Listing window (hours). Matches outside it are neither live nor usefully
// scheduled, so they never reach the catalog.
export const CATALOG_PAST_HOURS = 4;
export const CATALOG_FUTURE_HOURS = 30;

// A match counts as live for this long after kickoff when the upstream live
// feed does not list it.
export const LIVE_WINDOW_HOURS = 3;
// Upper bound for a match the upstream live feed still flags as live. Some
// events (motorsport, test cricket, fight cards) genuinely run past 3 hours.
export const EXTENDED_LIVE_WINDOW_HOURS = 8;

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
