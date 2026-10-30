# Importing a channel playlist

`npm run import:playlist -- <playlist.json>` merges an external list (the
group/station/option JSON that OTT list apps publish) into `public/channels.json`.
Every candidate stream is fetched first, so unreachable manifests are dropped and
the ones whose origin sends no CORS header are flagged to go through
`/api/hls-proxy`; the allowlist of origins that proxy may reach is regenerated
into `lib/proxyHosts.ts`. Stations join an existing channel when their names match
after normalisation, and a URL already in the list is never added twice.
Add `--dry-run` to see the counts without writing, `--probe-cache <file>` to reuse
an earlier run's probe results, and `--mark-new` to prefix the option names it
adds with `NEW ·` so the additions are easy to find in the channel list.

The **LPF** channel uses the stable numbered provider URLs and a separate
[live link resolver](#lpf-live-link-resolution), rather than the playlist importer.

The script is split by responsibility: `scripts/import-playlist.mjs` is the CLI
shell (arguments, files, output), `scripts/playlistImport.mjs` holds the pure
rules (flatten, classify, merge) and `scripts/libProbe.mjs` does the network
probing. Only the pure rules and the token helpers are unit-tested.

After importing, run `npm run optimize:logos` so new channel logos are served from
`public/logos` instead of third-party hosts. It downloads each remote logo once,
shrinks it to a 72px WebP and rewrites the channel's `logo`; logos that cannot be
fetched keep their original URL, and re-running skips files that already exist.

A stream is only imported when it can actually be played:

- Widevine and PlayReady are skipped; only ClearKey can be decrypted in-browser.
- A ClearKey entry whose key no longer matches the manifest's `default_KID` is
  dropped — providers rotate keys, and a stale one fails with an opaque error.
- Entries whose URL holds a `{token}` placeholder are resolved through the
  `token` endpoint the playlist supplies. The token it returns is a JWT scoped to
  one directory; when that is not the directory the media sits in, the token
  only buys the manifest and the segments stay behind the provider's paywall, so
  those entries are skipped.

## LPF live link resolution

The shipped **LPF** channel stores
`https://emitiendoenvivo.com/lpf/1.m3u8` through `18.m3u8`, not game-specific CDN
destinations. While Channels is visible, it loads `GET /api/channels/lpf` initially
and every 60 seconds. **Refresh links** sends `POST /api/channels/lpf` to bypass
both the Vercel and PC snapshot caches without changing the selected channel,
option number, or search query.

`lib/lpf.ts` resolves the provider redirects, follows only HTTPS playlist URLs on
`*.encoders.immergo.tv`, and inspects media playlists behind master playlists.
Automatic reads reuse snapshots for 60 seconds per warm server instance.
Manual refreshes join active provider lookups instead of starting duplicate work.
If an automatic relay GET is still in flight, a manual POST still reaches the PC;
the older GET response cannot overwrite its newer result. The overall provider
lookup deadline remains 25 seconds. The HLS proxy accepts these constrained CDN
playlist destinations; nested media resources retain its existing signed URLs.
All 18 option positions remain stable, including unavailable slots.

Numbered source requests retry connection resets (`ECONNRESET` or
`UND_ERR_SOCKET`, including wrapped causes) and expired 10-second per-attempt
requests up to six times after the initial attempt. Backoff starts at 500 ms,
doubles, and caps at 2.5 seconds; every attempt and wait remains within the shared
25-second refresh deadline. HTTP responses (including 403/CAPTCHA), unrelated
network errors, and cancellation of the shared deadline are not retried.
An exhausted source remains unavailable without discarding other resolved options.

Statuses describe the media timeline, not the match score:

- **Live**: the final media segment's timestamp is recent.
- **Broadcast finished**: `EXT-X-ENDLIST`, or the final segment timeline is older
  than the greater of 120 seconds and three target durations.
- **Unavailable**: an empty redirect, failed request, missing playlist, or invalid
  HLS response.
- **Unknown**: a resolved playlist lacks a trustworthy clock, or an already
  playing source could not be rechecked. It is not presented as confirmed live.

Newly selected finished, unavailable, and unresolved numbered sources do not
start a player. If the selected LPF player has already reported playback, a
later unavailable snapshot keeps that session's CDN URL and media element.
Only that selected option becomes **Unknown**, with a warning that its link
could not be rechecked; failed checks do not claim it is still confirmed live.
Other unavailable options do not gain stale fallback URLs.

A real media error, changing the selection, a confirmed finished broadcast, or
a replacement destination clears the retained session. Later failed checks
cannot resurrect a finished or previously abandoned player. A changed CDN
destination replaces the current game's player at the same option index;
unchanged destinations and successful rechecks do not interrupt playback.
Hiding the tab pauses refresh requests, and returning refreshes immediately.

### Upstream access requirement

The provider sometimes serves Vercel a **Bot Verification** reCAPTCHA challenge
or closes its connections. Browser-compatible TLS, header-only redirect requests,
and a separately deployed Brazil resolver did not remove this block. Automatic
resolution therefore needs provider-approved server access or an allowed external
resolver network. Failures are reported explicitly; the resolver does not fall
back to hardcoded game URLs or mark an old broadcast as live.

Set the server-only `LPF_PROXY_URL` environment variable to a provider-permitted
HTTP, HTTPS, SOCKS4, or SOCKS5 forward proxy URL, including credentials if required.
Set it in Vercel's **Production** environment before deploying the resolver.
The existing `impit` client uses this proxy only for the numbered provider URLs;
CDN playlist checks and media remain on the existing direct/proxy playback path.
Proxy credentials are never included in API responses or browser bundles.
Without this variable, resolution uses the server's own network, which is useful
locally but has been blocked on Vercel. A proxy whose egress is also challenged
cannot resolve the links; this setting does not solve or bypass reCAPTCHA.

### Free PC relay

The live resolver can use this PC instead of Vercel's network. Set server-only
`LPF_RELAY_URL` to the full HTTPS tunnel URL ending in `/lpf`, and
`LPF_RELAY_TOKEN` to the relay's secret, in Vercel Production and Preview.
Deploy again after changing either setting. When configured, the relay is the
exclusive source: failed authentication, transport, or snapshot validation
returns unavailable options rather than falling back to old game URLs.

`scripts/lpf-relay.mjs` binds only `127.0.0.1:3101`. It accepts authenticated
`GET /lpf` for cached reads and `POST /lpf` for manual refreshes, forwarding the
same method only to the fixed local `http://127.0.0.1:3100/api/channels/lpf`
endpoint. It is not a general proxy, does not forward credentials upstream,
and does not expose the app or PC files.
Vercel refuses relay redirects and validates all 18 canonical options before
returning their URLs and statuses to the browser. Video stays on the existing
HLS playback path; only link/status snapshots pass through this PC.

The private `.vercel/lpf-relay.json` contains `token`, `appPort`, and `relayPort`.
The configured token is 32 random bytes encoded as 64 hexadecimal characters.
This file and the downloaded `.vercel/cloudflared.exe` are gitignored.
Keep `LPF_RELAY_URL` **unset in the local app** so it resolves the provider
directly instead of calling itself through the tunnel.

To restart on this PC, run these commands from the repository root in three
terminals, leaving all three running:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3100
```

```powershell
npm run lpf:relay
```

```powershell
.\.vercel\cloudflared.exe tunnel --url http://127.0.0.1:3101
```

Cloudflare prints a new HTTPS hostname on each tunnel start. Update
`LPF_RELAY_URL` in Vercel to that hostname plus `/lpf`, then deploy with
`npx --yes vercel@latest deploy --prod --yes` to update the public deployment.
The token remains the one in the private config; never put it in browser code or
a URL.

[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
are free, require no account, and have no uptime guarantee. Automatic updates
require this PC to stay awake and all three processes to keep running.
Provider-side blocking can still occur on the PC connection; retries do not
bypass CAPTCHA or a permanent rejection. A stopped/unreachable relay is reported
as unavailable after the current snapshot expires. An already playing browser
session may continue with **Unknown** status as described above; the server does
not invent a replacement URL or report that session as confirmed live.

