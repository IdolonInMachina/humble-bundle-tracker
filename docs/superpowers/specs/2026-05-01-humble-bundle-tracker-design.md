# Humble Bundle Tracker — Design

**Date:** 2026-05-01
**Status:** Approved, ready for implementation planning

## Purpose

A local web app for browsing your Humble Bundle subscription history. Open it
when you want to check what's expiring, what you haven't claimed, or whether
you already own a game before buying it on Steam. Re-scrapes Humble on launch
(if data is stale) or on demand to pick up new bundles and updated claim
states.

Single user, runs on `localhost`, credentials stay on the machine.

## Tech stack

- **Runtime:** Bun
- **Server:** Hono, serving both `/api/*` and the built React bundle
- **Database:** SQLite via Drizzle ORM (`bun:sqlite`)
- **Search:** SQLite FTS5 over `items.name`
- **Frontend:** Vite + React + TypeScript, Tailwind + shadcn/ui, TanStack Query, TanStack Router
- **Testing:** `bun test` for unit/integration; Playwright optional for one e2e

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Bun process (single port)                                  │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  React UI   │───▶│  Hono API   │───▶│   Drizzle   │      │
│  │ (Vite SPA)  │    │   /api/*    │    │   SQLite    │      │
│  └─────────────┘    └──────┬──────┘    └─────────────┘      │
│                            │                                │
│                            ▼                                │
│                    ┌──────────────┐                         │
│                    │   Fetcher    │                         │
│                    │  (interface) │                         │
│                    └──────┬───────┘                         │
│                           │                                 │
│              ┌────────────┴────────────┐                    │
│              ▼                         ▼                    │
│     ┌────────────────┐       ┌─────────────────┐            │
│     │ CookieFetcher  │       │ PlaywrightFetcher│           │
│     │  (v1 — built)  │       │  (stub for v2)   │           │
│     └────────────────┘       └─────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

Single Bun process serves the API and the static React bundle. Vite dev server
runs alongside in development. On boot, the server checks `last_sync_at` and
kicks off a background sync if data is stale (default >6h). Manual "Refresh"
in the UI triggers the same path.

## Fetcher

A `Fetcher` interface so v1 and v2 implementations are swappable behind a
factory.

```ts
interface Fetcher {
  sync(opts: { since?: Date }): Promise<SyncReport>
}
```

### CookieFetcher (v1)

Authenticated against Humble's internal JSON endpoints using the user's
`_simpleauth_sess` cookie (pasted into the app via the Settings page, stored
in the `settings` table — never on disk in cleartext outside the SQLite
file).

Flow:

1. **Health check** — `GET /api/v1/user/order` for a 200 + JSON.
   401 / redirect → mark `sync_runs.status='error'` with `"cookie expired"`
   and surface a banner in the UI.
2. **List subscription orders** — `GET /api/v1/subscriptions/humble_monthly/subscription_products_with_gamekeys`
   returns Humble Choice month gamekeys.
3. **List one-off orders** — `GET /api/v1/user/order` returns gamekeys for
   store bundles and individual purchases.
4. **Fetch each order detail** — `GET /api/v1/orders/<gamekey>?all_tpkds=true`
   returns products, `tpkd_dict` (keys), claim states, expiries.
5. **Parse + upsert** — map Humble's response to `bundles` and `items` rows,
   keyed by `(bundle_id, machine_name)` for idempotency.
6. **Write `sync_runs` row** with counts.

**Concurrency:** ~5 in-flight order fetches. Below Humble's rate limit headroom.

**Status mapping:**
- `redeemed_key_val == null` → `'unclaimed'`
- `redeemed_key_val != null` → `'revealed'`
- `'redeemed'` is a manual UI toggle (Humble has no signal that you redeemed
  on Steam after revealing).
- `'expired'` is computed from `expires_at < now()` at read time, not stored.

**Caveat:** the exact response shapes above are educated guesses based on
public reverse-engineering. The first implementation task captures real
responses from a live cookie, dumps them as fixtures, and adjusts the parser
to match before the rest of the fetcher lands.

### PlaywrightFetcher (v2 stub)

Class implements `Fetcher`, throws `NotImplemented` from `sync()`. Real
implementation is out of v1 scope. The interface and factory exist so the
swap is a single-line change.

## Data model

Four tables. SQLite + Drizzle migrations.

```ts
bundles {
  id              text PK              // humble's gamekey or order id
  name            text
  source          text                 // 'choice' | 'bundle' | 'store' | 'other'
  purchased_at    integer (unix ms)    // null if unknown
  url             text                 // humble page for this bundle
  raw_json        text                 // full payload from humble, for re-parsing
  created_at      integer
  updated_at      integer
}

items {
  id              text PK              // hash of (bundle_id, machine_name)
  bundle_id       text FK
  name            text
  machine_name    text
  platform        text                 // 'steam' | 'gog' | 'origin' | 'drm-free' | 'other'
  status          text                 // 'unclaimed' | 'revealed' | 'redeemed'
  key_value       text                 // null until revealed; null for DRM-free
  claim_url       text
  expires_at      integer (unix ms)    // null if no expiry
  notes           text                 // user-editable
  tags            text                 // user-editable, comma-separated for v1
  created_at      integer
  updated_at      integer
}

sync_runs {
  id              integer PK
  started_at      integer
  finished_at     integer
  status          text                 // 'ok' | 'error' | 'partial'
  bundles_seen    integer
  items_added     integer
  items_updated   integer
  error           text                 // null unless status='error'
}

settings {
  key             text PK              // 'humble_cookie' | 'sync_interval_hours' | ...
  value           text
  updated_at      integer
}
```

**Invariants:**
- Re-running sync is idempotent on `(bundle_id, machine_name)`.
- Local edits to `notes`/`tags` are preserved across syncs.
- The cookie lives in `settings`, not in `.env` — UI manages it.

## API surface

```
GET    /api/health                       → { ok, last_sync_at, cookie_ok }

GET    /api/items                        → list with filters
         ?q=                             → text search across name (FTS5)
         ?platform=steam|gog|...
         ?status=unclaimed|revealed|redeemed|expired
         ?expiringWithin=days
         ?bundleId=
         ?sort=expiresAt|name|bundleDate
GET    /api/items/:id                    → one item
PATCH  /api/items/:id                    → { status?, notes?, tags? }

GET    /api/bundles                      → grouped by month/source
GET    /api/bundles/:id                  → bundle + its items

POST   /api/sync                         → kick off sync, returns runId
GET    /api/sync/status                  → current run + last run summary
GET    /api/sync/runs                    → recent sync_runs

GET    /api/settings                     → { hasCookie, syncIntervalHours, ... }
PUT    /api/settings/cookie              → { cookie }
PUT    /api/settings                     → other config
```

**Sync runner:** in-process queue, single-flight (one sync at a time, second
request returns the existing runId). UI polls `/api/sync/status` via TanStack
Query.

**Type sharing:** server exports route response types via Hono's
`hc<typeof app>` client. Web app imports those types directly. No codegen.

## Frontend views

Sidebar shell with five routes. Top bar has global search, sync indicator,
"Refresh" button.

### `/library` (default)

The "do I already own this?" surface.

- Big search input (focused on load), filters: platform, status, bundle.
- Virtualised table: name • platform • status • bundle • expires • actions.
- Row click expands inline: shows key (or "reveal on Humble"), `notes`
  textarea (saved on blur), "open claim page" button.
- Multi-select with shift-click; floating action bar shows
  "Open N claim pages." Opens sequentially via `window.open` with a
  confirm-on-first dialog (popup blocker mitigation).

### `/bundles`

- Choice months: accordion grouped by year.
- Store/one-off bundles: flat list sorted by `purchased_at`.
- Click into a bundle → its items + "open all unclaimed" button.

### `/expiring`

- Single sorted list, soonest first.
- Includes `expires_at != null AND status != 'redeemed'`.
- Color-coded urgency (red <7d, amber <30d, neutral otherwise).

### `/unclaimed`

- Everything `status='unclaimed'`, regardless of expiry.
- Same multi-select + open-all UX as Library.

### `/settings`

- Paste-cookie form with link to instructions
  (humblebundle.com → DevTools → Application → Cookies → `_simpleauth_sess`).
- "Test cookie" button hits `/api/health` after save.
- Sync interval, manual refresh, recent sync runs table.

**First-launch:** if `hasCookie === false`, every route redirects to
`/settings` with a banner.

## Project layout

Single `package.json` at the root. No monorepo, no workspaces. Bun handles
both server and Vite client.

```
humble-bundle-tracker/
├── README.md
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── docs/superpowers/specs/2026-05-01-humble-bundle-tracker-design.md
├── server/
│   ├── index.ts                   # Hono boot + static serve + sync-on-launch
│   ├── routes/{items,bundles,sync,settings}.ts
│   ├── db/{client,schema}.ts + migrations/
│   ├── fetcher/{types,cookie,playwright,parse,factory}.ts
│   ├── sync/{runner,scheduler}.ts
│   └── lib/search.ts              # FTS5 helpers
├── web/
│   ├── index.html, vite.config.ts, tailwind.config.ts
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── api/                   # typed Hono client
│       ├── components/{ui,ItemTable,BulkOpenBar,SyncIndicator}.tsx
│       └── routes/{Library,Bundles,Expiring,Unclaimed,Settings}.tsx
└── tests/
    ├── fetcher/{parse.test.ts, fixtures/}
    ├── api/items.test.ts
    └── e2e/library.test.ts        # optional
```

Scripts: `dev`, `build`, `start`, `test`, `db:migrate`, `db:studio`.

## Testing

- **Parser** (`tests/fetcher/parse.test.ts`) — fixture-based against
  sanitised real Humble JSON. Highest-value tests in the project; the parser
  is the bit most likely to break when Humble changes shapes.
- **API routes** — `app.request()` against in-memory SQLite. Covers
  filters, settings, sync state machine.
- **Sync runner** — stubbed `Fetcher` to verify single-flight, idempotency,
  partial-failure handling.
- **Frontend** — no unit tests for v1. Optionally one Playwright e2e
  against the running Bun server.
- **Integration against live Humble** — gated behind `HUMBLE_INTEGRATION=1`,
  not in default `bun test`.

## Error handling

- **Cookie failures** are first-class: dedicated error type, banner in UI,
  never a generic 500.
- **Per-order fetch failures** during sync are logged, the order is skipped,
  the run is marked `status='partial'`. Next sync retries.
- **Schema drift from Humble** logs the offending response to
  `sync_runs.error` and skips the row. We want to discover this via the UI
  banner, not by losing 200 items.
- **Frontend** errors bubble through TanStack Query error boundaries; toasts
  on mutation failures.

## Out of scope (v1)

Listed explicitly so they don't drift back in:

- Notifications, email, push
- Auto-claim
- Multi-user / auth
- Sharing libraries between people
- Mobile-polished UI (desktop-first; tablet works, phone won't be polished)
- PlaywrightFetcher implementation (interface only)
- Docker Compose (trivial to add later)
- `tags` editing UI (column exists in schema; only `notes` gets a textarea
  in v1)
- Triage integration (cut from spec at user request)

## Deploy

`bun install && bun run build && bun run start`. Binds to `localhost` only.
No reverse proxy, no Docker, no external dependencies beyond what `bun
install` pulls.
