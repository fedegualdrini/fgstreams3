# Architecture

How a match gets from the upstream feeds to the screen. File names are relative to the repo root.

## Data flow

```text
streamed.pk ──────► lib/api.ts ───────────────┐
  /matches/all-today, /matches/live, /stream/…│
                                              ▼
promiedos.com.ar ─► lib/promiedos.ts ──┐   lib/catalog.ts  (unstable_cache, 60 s)
angulismo feed ───► lib/angulismo.ts ──┼──►   1. normalize + keep the listing window   (catalogWindow.ts)
channels.json ────► lib/channelCatalog ┘      2. resolve playable streams per source   (catalogStreams.ts)
                                              3. match fixtures → TV channels          (catalogBroadcasts.ts)
                                              4. drop matches nobody can watch
                                                  │
                    ┌─────────────────────────────┴──────────────┐
                    ▼                                            ▼
        server pages (app/page.tsx,                   app/api/diagnostics/broadcasts
        app/match/[id], sitemap.ts)
                    │  CatalogMatch props
                    ▼
        client components (match list, match detail, multi-match)
                    │  poll
                    ▼
        app/api/scores/**  ──►  lib/flashscore.ts (HTTP) ──► lib/flashscoreParse.ts (HTML → data)
```

## The catalog (`lib/catalog.ts`)

- Built from five sources in parallel: streamed.pk matches, streamed.pk's live flags, Promiedos, the angulismo feed and the channel catalog. Only the match feed is mandatory; the other three degrade to "no extra data".
- `resolveStreams` looks up every (match, source) pair with a concurrency cap and a time budget. A source that failed or timed out is *unresolved*, which is different from *empty*, and an unresolved match is never dropped.
- Broadcasters come from two feeds with different clocks. Promiedos localises kickoff to the caller's IP, so `estimateFeedOffsetMs` (`lib/teamMatch.ts`) measures the offset from unambiguous name matches; angulismo times are fixed Argentina-local.
- `lib/broadcasters.ts` turns a feed entry into catalog channels (angulismo first, Promiedos fills the rest).
- An empty upstream feed throws `EmptyUpstreamError` so it is never cached. `getCatalog` then serves the last good catalog held in module memory, re-filtered against the current clock.

## Upstream access

- `lib/httpClient.ts` is the only code that calls `fetch` for an upstream: optional timeout, retry on 5xx, Zod validation (`lib/schemas.ts`) and logging. It answers `null` on any failure.
- Each source module (`api`, `promiedos`, `angulismo`, `flashscore`) maps `null` to its own failure signal: `[]`, `ok: false`, or the last good snapshot flagged `stale: true`.
- `lib/logger.ts` is the only code that writes to the console. Lines read `scope: message`.
- Timeouts, retry counts, cache windows and CDN headers live in `lib/constants.ts`, each with the reason for its value.

## API routes (`app/api`)

- `scores/[sport]`, `scores/match/[flashscoreId]`, `streams/[source]/[id]` are wrapped with `withErrorResponse` and answer through `jsonWithCache` (`lib/httpRoute.ts`): one `502 { error }` shape, one place that formats `Cache-Control`.
- `scores/[sport]` adds an in-memory dedup window on top of `unstable_cache` so a burst of cold-start requests produces one Flashscore fetch.
- `diagnostics/broadcasts` is a thin route over `lib/diagnosticsBroadcasts.ts`; `?q=<team>` traces matching fixtures through each catalog stage.
- `hls-proxy` and `media/*` are independent of the catalog (channel playback and TMDB search).

## Client side

- Server pages pass `CatalogMatch` data down as props, so streams and broadcasters are present on first paint.
- `lib/useLiveScores.ts` and `lib/useMatchStats.ts` poll the score routes on the intervals in `lib/constants.ts`; score matching helpers are in `lib/scoreUtils.ts`.
- Playback fallback (rotating to the next stream) uses `lib/streamSelector.ts` for the initial choice.
