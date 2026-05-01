# Humble Bundle Tracker

A local web app for browsing your Humble Bundle subscription history. Open
it when you want to check what's expiring, what you haven't claimed, or
whether you already own a game before buying it on Steam.

Single-user, runs on `localhost`, credentials stay on the machine.

## Status

v0.1 functional. Design lives at
[`docs/superpowers/specs/2026-05-01-humble-bundle-tracker-design.md`](docs/superpowers/specs/2026-05-01-humble-bundle-tracker-design.md).

## Stack

- Bun + TypeScript
- Hono (API + static React serve)
- SQLite via Drizzle, FTS5 search
- Vite + React + Tailwind + shadcn/ui
- TanStack Query + TanStack Router

## How it works

You paste your Humble session cookie into the Settings page. The app calls
Humble's internal JSON endpoints with that cookie to pull your subscription
history into a local SQLite db. Four views — Library, Bundles, Expiring
Soon, Unclaimed — make it easy to find a game, see what's about to expire,
or batch-open claim pages.

The cookie never leaves your machine. The SQLite file is gitignored. There
is no telemetry, no auth, no multi-user, no auto-claim.

## Run

```sh
bun install
bun run db:migrate                  # one-time, creates ./data/humble.db
bun run dev                         # dev mode: server + vite, live reload
# or
cd web && bun run build && cd ..
PORT=5173 bun run start             # production: single port, serves built UI
```

Open http://localhost:5173, paste your `_simpleauth_sess` cookie in
**Settings**, then click Refresh. Subsequent launches will auto-sync if data
is older than the configured interval (default 6h).

Note: `bun run dev` chains the backgrounded server with Vite in one shell, so
Ctrl-C can orphan the server. For a cleaner dev loop, run
`bun run dev:server` and `bun run dev:web` in separate terminals.

## Cookie

In a browser logged into humblebundle.com:

1. Open DevTools → Application → Cookies → `https://www.humblebundle.com`
2. Copy the **value** of `_simpleauth_sess`
3. Paste it into the app's Settings page

The cookie lasts months in practice. When it expires, you'll see a banner —
re-paste a fresh value.
