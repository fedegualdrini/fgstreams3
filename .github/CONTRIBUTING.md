# Contributing

Thanks for taking the time to improve FGStreams. Bug reports, fixes and ideas are all welcome.

## Setup

Requires Node.js 20.19+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:3000
```

Copy the variables from the [Environment section of the README](../README.md#environment) into `.env.local` if you need movie/TV search or the HLS proxy.

## Before you open a pull request

CI runs the same three commands, so run them locally first:

```bash
npm run lint
npm run typecheck
npm test
```

## Where things live

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md): how data flows from the upstream feeds to the screen.
- [docs/PROJECT_STRUCTURE.md](../docs/PROJECT_STRUCTURE.md): what each folder and module is for.
- [docs/CHANNEL_IMPORT.md](../docs/CHANNEL_IMPORT.md): merging an external playlist into the channel catalog.

## Conventions

- **Fetching upstreams:** catalog requests go through `fetchJson` / `fetchText` in `lib/httpClient.ts`. embed.st playback uses `impit` as an explicit exception: resolve and fetch within the same server request, with a deadline and automatic redirects disabled. Keep that native client confined to the fixed resolver, allowlisted manifest relay and header-only `HEAD` lookups on HTTPS `lb<number>.strmd.st/b/` media gateways. Validate gateway redirects against the direct CDN allowlist; never relay their video bodies or follow arbitrary redirect chains. Do not move resolution back to the browser. Direct mode must not load provider scripts/iframes; Original embed requires explicit selection.
- **Logging:** use `createLogger('scope')` from `lib/logger.ts`; no `console.*` in `lib/` or `app/api`.
- **API routes:** wrap handlers with `withErrorResponse` (`lib/httpRoute.ts`); use `jsonWithCache` for cacheable data. embed.st response keys, signed URLs and live manifests must remain `no-store`.
- **Limits:** timeouts, cache windows and retry counts are named constants in `lib/constants.ts`, each with the reason for its value.
- **Styling:** use the shared classes in `app/styles/primitives.css` (`.btn`, `.kbd`, `.status-panel`, ...) and the tokens in `app/globals.css` instead of inline styles and JS hover handlers. Keep inline `style` for truly dynamic values.
- **Components:** keep them small. Put stateful logic in a hook and pure logic in a plain function under `lib/` so it can be unit-tested.
- **Tests:** cover behavior and edge cases of pure logic (`lib/*.test.ts`). Do not test wiring or copy.

## Pull requests

- Keep each PR focused on one change.
- Describe what changed and why, and how you verified it.
- UI changes: include a before/after screenshot.
