# Contributing

Thanks for taking the time to improve FGStreams. Bug reports, fixes and ideas are all welcome.

## Setup

Requires Node.js 20.19+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:3000
```

Copy the variables from the [Environment section of the README](README.md#environment) into `.env.local` if you need movie/TV search or the HLS proxy.

## Before you open a pull request

CI runs the same three commands, so run them locally first:

```bash
npm run lint
npm run typecheck
npm test
```

## Where things live

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how data flows from the upstream feeds to the screen.
- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md): what each folder and module is for.
- [docs/CHANNEL_IMPORT.md](docs/CHANNEL_IMPORT.md): merging an external playlist into the channel catalog.

## Conventions

- **Fetching upstreams:** go through `fetchJson` / `fetchText` in `lib/httpClient.ts`. Do not call `fetch` for an upstream directly.
- **Logging:** use `createLogger('scope')` from `lib/logger.ts`; no `console.*` in `lib/` or `app/api`.
- **API routes:** wrap handlers with `withErrorResponse` and answer with `jsonWithCache` (`lib/httpRoute.ts`).
- **Limits:** timeouts, cache windows and retry counts are named constants in `lib/constants.ts`, each with the reason for its value.
- **Styling:** use the shared classes in `app/globals.css` (`.btn`, `.kbd`, `.status-panel`, ...) instead of inline styles and JS hover handlers. Keep inline `style` for truly dynamic values.
- **Components:** keep them small. Put stateful logic in a hook and pure logic in a plain function under `lib/` so it can be unit-tested.
- **Tests:** cover behavior and edge cases of pure logic (`lib/*.test.ts`). Do not test wiring or copy.

## Pull requests

- Keep each PR focused on one change.
- Describe what changed and why, and how you verified it.
- UI changes: include a before/after screenshot.
