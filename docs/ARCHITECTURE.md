# Architecture

How a match gets from the upstream feeds to the screen. File names are relative to the repo root.

## Data flow

```text
strmfree.st ──────► lib/api.ts ───────────────┐
  /api/v1/streams, /categories, /sources/…   │
                                              ▼
promiedos.com.ar ─► lib/promiedos.ts ──┐   lib/catalog.ts  (unstable_cache, 60 s)
angulismo feed ───► lib/angulismo.ts ──┼──►   1. normalize + keep the listing window   (catalogWindow.ts)
channels.json ────► lib/channelCatalog ┘      2. reuse inline live/standby source URLs
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

- StreamFree's stream listing, Promiedos and angulismo are requested in parallel. The channel catalog merges shipped channels with that same angulismo snapshot instead of reading and parsing the feed again. Only the stream feed is mandatory; optional-feed failures retain the shipped-channel fallback.
- `normalizeMatches` uses `stream_key` as the stable ID, converts Unix seconds to ISO time, and retains team logos and thumbnails. `live_sources` is authoritative even for delayed events or long-running channels with old timestamps; non-live fixtures retain the listing window.
- `lib/streamfree.ts` deduplicates URLs, places live variants before standby ones, and infers quality from variant suffixes. The catalog and multi-match view reuse inline variants without per-match lookups. Playback retry uses `/sources/{stream_key}` through the local stream route.
- Broadcasters come from two feeds with different clocks. Promiedos localises kickoff to the caller's IP, so `estimateFeedOffsetMs` (`lib/teamMatch.ts`) measures the offset from unambiguous name matches; angulismo times are fixed Argentina-local.
- `lib/broadcasters.ts` turns a feed entry into catalog channels (angulismo first, Promiedos fills the rest).
- A failed upstream stream fetch returns `null` and throws `UpstreamError` inside the catalog cache callback. `getCatalog` then serves the last good catalog held in module memory. A successful `{ count: 0, streams: [] }` is valid and replaces the old catalog.

## Upstream access

- Catalog upstream requests go through `lib/httpClient.ts`: optional timeout, retry on 5xx, Zod validation (`lib/schemas.ts`) and logging. It answers `null` on failure. Direct-playback resolvers use their provider-specific manifest transports described below.
- Each source module (`api`, `promiedos`, `angulismo`, `flashscore`) maps `null` to its own failure signal: `[]`, `ok: false`, or the last good snapshot flagged `stale: true`.
- `lib/logger.ts` is the only code that writes to the console. Lines read `scope: message`.
- Shared timeouts, retry counts, cache windows and CDN headers live in `lib/constants.ts`; provider-specific response bounds and transport deadlines live beside their resolver.

## API routes (`app/api`)

- `scores/[sport]`, `scores/match/[flashscoreId]`, `streams/[source]/[id]` are wrapped with `withErrorResponse` and answer through `jsonWithCache` (`lib/httpRoute.ts`): one `502 { error }` shape, one place that formats `Cache-Control`.
- `scores/[sport]` adds an in-memory dedup window on top of `unstable_cache` so a burst of cold-start requests produces one Flashscore fetch.
- `diagnostics/broadcasts` is a thin route over `lib/diagnosticsBroadcasts.ts`; `?q=<team>` traces matching fixtures through each catalog stage.
- `hls-proxy` and `media/*` are independent of the catalog (channel playback and TMDB search).

## Client side

- Server pages pass `CatalogMatch` data down as props, so streams and broadcasters are present on first paint.
- `lib/useLiveScores.ts` and `lib/useMatchStats.ts` poll on the existing intervals in `lib/constants.ts`, skip hidden or overlapping polls, and abort obsolete requests. Detail polling stops even when the first response is already finished. Client HTTP/network failures retain stale scores for the affected sport without blocking successful sports; a successful empty response still clears them. The score API's existing upstream-failure response is also an empty list, so clients cannot distinguish that case.
- Identical score entries retain their references and do not publish a new score map. Listing filters and available sports are memoized independently of polling; unchanged upcoming grids, history, toolbars and match links skip rendering. Search/sport changes still reset upcoming pagination.
- Movie search retains its debounce, aborts requests when the query/type changes or the component unmounts, and ignores obsolete responses and errors so they cannot replace current results or clear the current loading state.
- HLS and DASH SDKs load only when their engines mount. Direct playback imports the embed.st loader adapter only for that provider; StreamFree uses the ordinary HLS loader. Source changes, mode switches and teardown invalidate pending engine setup before it can attach to a video.
- Initial selection and explicit next-stream actions use `lib/streamSelector.ts`: live first, then the existing language/quality preference and stable source order. Direct failures stay local rather than automatically rotating sources or opening an iframe.

## Shared direct playback

- `lib/directPlayback.ts` dispatches by the actual embed URL using `lib/embedSt.ts` and `lib/streamfreeDirect.ts`. `StreamPlayer` enables Direct in single-match and multi-match views; `ChannelStream` does the same for supported channel options. Source labels alone do not grant eligibility. Ordinary HLS/DASH engines remain independent.
- `players/DirectPlayback` mounts only the selected engine, with Direct mode as the default. **Original embed** is explicit opt-in and may load the provider's ads/popups. A direct failure stays local, with retry and optional manual next-source controls. Changing source or reloading resets to Direct mode.
- The wrapper owns loading/reconnecting/error presentation so channel overlays cannot block autoplay controls or the mode switch. `players/DirectHlsPlayer` shares hls.js/native-HLS ownership and updates mute state without restarting. Fatal network errors restart the same source from its root playlist, with three restarts at 2/4/8-second backoff. Sixty seconds of uninterrupted playback progress renews the budget; pause, waiting and seeking interrupt that window. Other fatal errors or exhausted recovery stop for manual action. Source changes, mode switches and unmounts cancel timers and retire old engine callbacks. `/stream-test` uses the same engine.

### StreamFree

- `lib/streamfreeServer.ts` parses bounded HTML literal constants and signing JSON without executing scripts. Explicit variants must match the requested stream key, quality and source suffix; bare embeds select that key's default source.
- `/api/streamfree/manifest` fetches embed metadata, provider-local `/get-stream-key/{key}` and the freshly signed playlist. It uses native fetch with no cookies or invented provider headers, redirects disabled, caller cancellation and a 15-second total deadline. Success and errors are uncached; upstream exceptions are not exposed or logged because they can contain signed URLs.
- Nested playlist links return through the local route, constrained to the resolved stream directory. Expired authentication fields are replaced with newly resolved values. Media URIs remain browser-direct only on the verified HTTPS `p16-oec-general-useast5.ttcdn-us.com/obj/` origin/path boundary. Unsupported media, external streams and provider rejections fail locally; the route never fetches or proxies video.
- Plain hls.js handles the observed PNG-prefixed MPEG-TS segments. No StreamFree iframe, ad script, JWPlayer or P2P SDK loads in Direct mode. Original embed remains explicit. Some origin/CDN1 sources returned HTTP 403 during probes and are not bypassed. Native Safari and long-duration expiry remain runtime-unverified.

### embed.st

- `lib/embedStServer.ts` validates a binary response of at most 8 KiB and uses its `Goat` header as a 32-byte UTF-8 key. It unwraps protobuf field 1, reverses the printable-ASCII rotation, base64-decodes, then authenticates ChaCha20-Poly1305 (12-byte nonce, trailing 16-byte tag, no AAD). Only an authenticated HTTPS playlist on an explicit `lb<number>.strmd.st/secure/` origin is accepted.
- `/api/embed-st/manifest` resolves, decodes and fetches the playlist within one invocation using `impit` with a Chrome-compatible HTTP/TLS profile, provider Referer/Origin, a deadline and redirects disabled. Standard Node fetch received HTTP 403; browser-issued tokens also failed from Vercel even with the compatible transport. Resolving and fetching together returned HTTP 200 on Vercel.
- Nested playlist links contain the embed URL and a stream-relative variant path. Every request resolves a fresh signature before applying that variant, confined to the newly resolved stream's origin and directory. This stateless approach avoids relying on stable serverless egress or reusing client-context tokens. CDN media URLs remain direct browser requests; the endpoint cannot fetch arbitrary hosts or relay segments.
- `rewriteEmbedStManifest` exposes only the highest-`BANDWIDTH` rendition, preserving shared master tags and alternate-audio playlist links. This prevents automatic high-to-low quality switches. Non-playlist resources, including `URI` attributes, must use the verified HTTPS origins `p16-common-sign.tiktokcdn.com` or `p19-common-sign.tiktokcdn.com`; restricted `lb<number>.strmd.st` media is never handed to the browser. Unsupported media fails locally rather than proxying video, choosing a lower rendition or silently opening an iframe. Slow connections may buffer.
- `lib/embedStHls.ts` supplies a per-engine hls.js loader adapter for timestamped, full-segment Direct playlists. It assigns a stable private segment identity only when sequence, continuity, duration, gap state and program time match the previous window (50 ms timestamp tolerance). The current approved CDN destination is encoded separately and restored before XHR; private identities are never fetched. Only the latest metadata window per playlist is retained, with no media cache or signed-URL history. Conflicting metadata still produces a new identity and the normal hls.js consistency error. Unsupported encryption, map/byte-range, low-latency and variable-substitution tags bypass normalization; ordinary HLS/DASH and native HLS are unchanged. Client and server share the explicit direct-CDN origin record in `lib/embedSt.ts`.
- Restricted HTTPS media references on `lb<number>.strmd.st/b/` are resolved with a header-only `HEAD` request in the same provider context. The asynchronous manifest rewriter accepts only standard redirect statuses with a Location ending on a verified direct CDN, including resources in `URI` attributes. Gateway headers are read sequentially, redirects are not followed, and response bodies are cancelled. No video bytes pass through the app; a missing, rejected, chained or unapproved redirect fails the manifest instead of leaking a forbidden gateway URL to the browser.
- Manifest responses are uncacheable. Response keys and signed playlist URLs stay server-side and are not persisted. Keep `impit` external to webpack (`serverComponentsExternalPackages` in `next.config.mjs`) and install optional dependencies so its platform-specific native binary is deployed. Successful URL decoding does not guarantee a live stream; the provider may still return errors such as HTTP 404.

