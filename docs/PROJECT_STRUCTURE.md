# Project structure

```text
app/
  page.tsx                         Home page with match list/search
  layout.tsx                       Root layout and metadata
  error.tsx                        Root error boundary
  sitemap.ts                       Sitemap generation
  globals.css                      Design tokens and shared UI primitives
  channels/                        Channels page (+ error boundary)
  movies/                          Movies and series page (+ error boundary)
  match/[id]/                      Match detail page, metadata and error boundary
  api/
    hls-proxy/route.ts             HTTP HLS proxy for selected channel streams
    media/search/route.ts          TMDB movie/TV search endpoint
    media/tv/[id]/route.ts         TMDB TV season metadata endpoint
    scores/[sport]/route.ts        Live score endpoint
    scores/match/[flashscoreId]/route.ts
                                    Match detail/statistics endpoint
    streams/[source]/[id]/route.ts Stream endpoint for Streamed sources
    diagnostics/broadcasts/route.ts
                                    Broadcast pipeline health; ?q=<team> traces one match

components/                        Shared and page-level components
  ErrorPanel.tsx                   Body for route-level error.tsx boundaries
  ErrorBoundary.tsx                Client error boundary
  MatchListWithSearch.tsx          Home page list: search, filters, scores, watch history
  MatchDetailClient.tsx            Match playback, fallback, stats and multi-match entry
  MultiMatchView.tsx               Up-to-four match viewing mode
  ChannelsPageClient.tsx           Channels page entry
  MoviesPageClient.tsx             Movies page entry
  channels/ match-detail/ match-list/ movies/ multi-match/ players/
                                   Feature folders: the sub-components and hooks each
                                   page-level component above is assembled from
  *.tsx                            Remaining single-purpose pieces (cards, players,
                                   header, toast, spinner, skeletons, ...)

lib/
  # Data layer (server)
  api.ts                           Streamed API: matches, live ids, streams, sports
  promiedos.ts                     Promiedos fixtures + TV networks (__NEXT_DATA__)
  angulismo.ts                     angulismotv feed: live channels and fixture broadcasters
  flashscore.ts                    Flashscore HTTP client (live scores, match detail)
  flashscoreParse.ts               Flashscore HTML -> typed data (pure, unit-tested)
  catalog.ts                       Cached match catalog (build, fallback, sort)
  catalogWindow.ts                 Listing window and live-state rules
  catalogStreams.ts                Bounded-concurrency stream resolution
  catalogBroadcasts.ts             Feed offsets and fixture -> channel matching
  channelCatalog.ts                Shipped channels.json merged with the live catalog
  broadcasters.ts                  Broadcaster name -> local channel resolution
  teamMatch.ts                     Fuzzy fixture matching and feed clock alignment
  diagnosticsBroadcasts.ts         Report builders for the diagnostics route
  httpClient.ts                    fetchJson / fetchText: timeout, retry, validation, logging
  httpRoute.ts                     Route helpers: withErrorResponse, jsonWithCache
  logger.ts                        createLogger(scope): the only console writer
  schemas.ts                       Zod schemas for external API data
  constants.ts                     Cache windows, timeouts and limits, with rationale
  # Shared / client
  matchUtils.ts                    Match normalization, liveness, and image helpers
  matchFilters.ts, matchListView.ts, matchDetailStreams.ts, multiMatch.ts
                                   Pure view-model logic behind the match components
  channelOptions.ts                Playable-option filtering for channels
  movieEmbed.ts, movieTmdb.ts      Movie/TV embed URLs and TMDB mapping
  playerHls.ts                     hls.js configuration
  streamSelector.ts                Preferred stream selection
  scoreAliases.ts, scoreUtils.ts   Team alias data and score matching
  sportMap.ts                      Sport name mapping
  urlValidation.ts, proxyHosts.ts  Stream URL validation; generated HLS-proxy allowlist
  dateUtils.ts                     Client-safe date formatting helpers
  useLiveScores.ts                 Live score polling hook
  useMatchStats.ts                 Match detail polling hook
  watchHistory.ts                  Local storage watch history helpers

types/
  api.ts                           Sports, stream, score, catalog and feed types
  channels.ts                      Channel catalog types
  movies.ts                        Movie and TV metadata types
  vitest-setup.ts                  Vitest setup: jest-dom matchers (runtime and types)

scripts/
  import-playlist.mjs              CLI: arguments, files, console output
  playlistImport.mjs               Pure rules: flatten, classify, merge, proxy hosts
  libProbe.mjs                     Network probing of candidate streams

public/
  channels.json                    Channel catalog

docs/
  ARCHITECTURE.md                  Data flow from upstream feeds to the screen
  PROJECT_STRUCTURE.md             This file
  CHANNEL_IMPORT.md                Merging an external playlist into the catalog
  screenshots/, banner.png, social-preview.png
                                   Images used by README.md and the GitHub social card
  plans/                           Planning notes

.github/                           CONTRIBUTING.md, CI workflow, issue forms, pull request template

vitest.config.ts                   Vitest configuration
```

## Conventions

### Server code

- **One fetch path.** Upstream calls go through `fetchJson` / `fetchText` in `lib/httpClient.ts` (timeout, optional retry on 5xx, Zod validation). They return `null` on failure; each data module decides what failure means for its callers (`[]`, `ok: false`, or a `stale: true` snapshot).
- **One logger.** `createLogger('scope')` from `lib/logger.ts` prints `scope: message` plus any error as a trailing argument. Do not call `console.*` in `lib/` or `app/api`.
- **One route shape.** Wrap handlers with `withErrorResponse(scope, message, handler)` and respond with `jsonWithCache(data, maxAge, swr)` (`lib/httpRoute.ts`): unexpected errors become a logged `502 { error }`.
- **Named limits.** Timeouts, cache windows and CDN headers are constants in `lib/constants.ts`, each with a comment explaining the value.

### UI

Shared primitives live in `app/globals.css`; prefer them over per-component inline styles and keep inline `style` for truly dynamic values.

- `.btn` — small uppercase button. Active state via `aria-pressed="true"` or `.is-active`; modifiers `.btn--primary` (filled call to action) and `.btn--icon` (square glyph button).
- `.kbd` — keyboard key cap.
- `.status-panel` (+ `__title`, `__message`) — centered column for error, empty and "nothing to play" states. `components/ErrorPanel.tsx` builds on it for route-level `error.tsx` files.
- Colors, fonts and spacing come from the CSS variables at the top of the file (`--bg`, `--line`, `--accent`, `--font-display`, ...).
