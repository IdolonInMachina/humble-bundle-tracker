# Humble Bundle Tracker

A local web app for browsing your Humble Bundle subscription history. Open
it when you want to check what's expiring, what you haven't claimed, or
whether you already own a game before buying it on Steam.

Single-user, runs on `localhost`, credentials stay on the machine.

## Status

In development. Design is approved and lives at
[`docs/superpowers/specs/2026-05-01-humble-bundle-tracker-design.md`](docs/superpowers/specs/2026-05-01-humble-bundle-tracker-design.md).
Implementation plan + code to follow.

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

Coming soon. Will be roughly:

```sh
bun install
bun run dev      # dev with hot reload
bun run start    # production build, single port
```
