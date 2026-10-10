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
