// ─── Upstream cache windows (seconds, Next.js Data Cache) ───────────────────

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

// The angulismo feed carries today's and tomorrow's fixtures with live stream
// URLs, so it is refreshed more eagerly than the Promiedos broadcaster list.
export const REVALIDATE_ANGULISMO = 600;

// Flashscore live scores are cached for exactly the dedup window below, so the
// Data Cache and the in-memory route cache expire together.
export const REVALIDATE_FLASHSCORE_SCORES = 25;

// ─── Upstream request behavior ──────────────────────────────────────────────

// streamed.pk is flaky under load: two retries (5xx / network errors only)
// recover most blips without noticeably delaying a render.
export const API_MAX_RETRIES = 2;
// Base delay between retries; grows linearly with the attempt number.
export const RETRY_BACKOFF_MS = 300;

// Broadcast data is optional, so it gets a short leash: a slow upstream must
// never hold up a render.
export const PROMIEDOS_TIMEOUT_MS = 6_000;
export const ANGULISMO_TIMEOUT_MS = 6_000;

// The diagnostics endpoint measures raw reachability, so it waits longer than
// the render path does before declaring a probe dead.
export const DIAGNOSTICS_PROBE_TIMEOUT_MS = 10_000;

// ─── Match catalog ──────────────────────────────────────────────────────────

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

// ─── Score API routes ───────────────────────────────────────────────────────

// Deduplication window to avoid hammering flashscore on cold-start bursts
export const SCORE_DEDUP_WINDOW_MS = 25_000;
// Entries older than this are pruned from the module-level cache to prevent unbounded growth
export const SCORE_CACHE_MAX_AGE_MS = 120_000;

// CDN cache headers (seconds) sent with route responses.
export const SCORES_CDN_MAX_AGE = 30;
export const SCORES_CDN_STALE_WHILE_REVALIDATE = 60;
// A finished match no longer changes, so its detail can be cached much longer.
export const FINISHED_MATCH_CDN_MAX_AGE = 3600;
export const STREAMS_CDN_MAX_AGE = 60;
export const STREAMS_CDN_STALE_WHILE_REVALIDATE = 30;

// ─── Client polling and player timeouts (ms) ────────────────────────────────

export const SCORES_POLL_INTERVAL_MS = 45_000;
export const FIXTURE_POLL_INTERVAL_MS = 30_000;

// After this delay with no iframe onLoad, the player treats the stream as failed.
export const STREAM_LOAD_TIMEOUT_MS = 10_000;
export const CHANNEL_LOAD_TIMEOUT_MS = 15_000;
