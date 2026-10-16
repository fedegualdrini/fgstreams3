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

- Catalog upstream requests go through `lib/httpClient.ts`: optional timeout, retry on 5xx, Zod validation (`lib/schemas.ts`) and logging. It answers `null` on failure. The embed.st same-context resolver and manifest transport are a provider-specific exception described below.
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

## Shared embed.st direct playback

- `lib/embedSt.ts` recognizes only `https://embed.st/embed/<source>/<id>/<number>` URLs. `StreamPlayer` enables direct playback for qualifying sources in single-match and multi-match views; `ChannelStream` does the same for qualifying channel options. Source labels or Streamed.pk provenance alone do not grant eligibility. Other providers and HLS/DASH engines are unchanged.
- `players/EmbedStPlayback` mounts only the selected engine, with Direct mode as the default. **Original embed** is explicit opt-in and may load the provider's ads/popups. A direct failure stays local, with retry and optional manual next-source controls; it never automatically loads an iframe or rotates the match's source. Changing source or reloading resets to Direct mode.
- The wrapper owns loading/error presentation so channel connection overlays cannot block autoplay controls or the engine switch. `players/EmbedStPlayer` uses hls.js or native HLS, stops on fatal errors and updates the video element's mute state without restarting the connection. `/stream-test` retains its manual URL form and shares this engine and relay.
- `lib/embedStServer.ts` validates a binary response of at most 8 KiB and uses its `Goat` header as a 32-byte UTF-8 key. It unwraps protobuf field 1, reverses the printable-ASCII rotation, base64-decodes, then authenticates ChaCha20-Poly1305 (12-byte nonce, trailing 16-byte tag, no AAD). Only an authenticated HTTPS playlist on an explicit `lb<number>.strmd.st/secure/` origin is accepted.
- `/api/embed-st/manifest` resolves, decodes and fetches the playlist within one invocation using `impit` with a Chrome-compatible HTTP/TLS profile, provider Referer/Origin, a deadline and redirects disabled. Standard Node fetch received HTTP 403; browser-issued tokens also failed from Vercel even with the compatible transport. Resolving and fetching together returned HTTP 200 on Vercel.
- Nested playlist links contain the embed URL and a stream-relative variant path. Every request resolves a fresh signature before applying that variant, confined to the newly resolved stream's origin and directory. This stateless approach avoids relying on stable serverless egress or reusing client-context tokens. CDN media URLs remain direct browser requests; the endpoint cannot fetch arbitrary hosts or relay segments.
- `rewriteEmbedStManifest` exposes only the highest-`BANDWIDTH` rendition, preserving shared master tags and alternate-audio playlist links. This prevents automatic high-to-low quality switches. Non-playlist resources, including `URI` attributes, must use the verified HTTPS origins `p16-common-sign.tiktokcdn.com` or `p19-common-sign.tiktokcdn.com`; restricted `lb<number>.strmd.st` media is never handed to the browser. Unsupported media fails locally rather than proxying video, choosing a lower rendition or silently opening an iframe. Slow connections may buffer.
- Manifest responses are uncacheable. Response keys and signed playlist URLs stay server-side and are not persisted. Keep `impit` external to webpack (`serverComponentsExternalPackages` in `next.config.mjs`) and install optional dependencies so its platform-specific native binary is deployed. Successful URL decoding does not guarantee a live stream; the provider may still return errors such as HTTP 404.

