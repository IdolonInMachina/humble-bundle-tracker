# Humble Bundle Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app that scrapes a user's Humble Bundle subscription history via cookie auth, stores it in SQLite, and exposes Library / Bundles / Expiring / Unclaimed views in a React UI.

**Architecture:** Single Bun process. Hono server hosts `/api/*` and serves the built React bundle from `/`. CookieFetcher hits Humble's internal JSON endpoints, parses, upserts into SQLite via Drizzle. Async single-flight sync runner; UI polls status. PlaywrightFetcher exists as a stub behind the same interface.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle, `bun:sqlite` (with FTS5), Vite, React, Tailwind, shadcn/ui, TanStack Query, TanStack Router, `bun test`.

**Spec:** `docs/superpowers/specs/2026-05-01-humble-bundle-tracker-design.md`.

---

## Phase 0 — Scaffolding

### Task 1: Bun project init

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`

- [ ] **Step 1: Initialize package.json**

Run: `bun init -y`

Then edit `package.json` to:

```json
{
  "name": "humble-bundle-tracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --hot server/index.ts & cd web && bun run dev",
    "dev:server": "bun run --hot server/index.ts",
    "dev:web": "cd web && bun run dev",
    "build": "cd web && bun run build",
    "start": "bun server/index.ts",
    "test": "bun test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run server/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [ ] **Step 2: Add dependencies**

Run:
```bash
bun add hono drizzle-orm
bun add -d drizzle-kit @types/bun typescript
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM"],
    "types": ["bun"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "paths": {
      "@server/*": ["./server/*"]
    }
  },
  "include": ["server/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "web/dist"]
}
```

- [ ] **Step 4: Write .env.example**

```env
PORT=5173
DB_PATH=./data/humble.db
SYNC_INTERVAL_HOURS=6
```

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock tsconfig.json .env.example
git commit -m "chore: bun project init with deps and tsconfig"
```

---

### Task 2: Hono server skeleton with health route

**Files:**
- Create: `server/index.ts`
- Create: `server/routes/health.ts`
- Create: `tests/api/health.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/health.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { app } from "../../server/index.ts";

describe("GET /api/health", () => {
  test("returns ok=true and a last_sync_at field", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("last_sync_at");
    expect(body).toHaveProperty("cookie_ok");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `bun test tests/api/health.test.ts`
Expected: FAIL — `app` cannot be imported.

- [ ] **Step 3: Write minimal server**

`server/routes/health.ts`:

```ts
import { Hono } from "hono";

export const health = new Hono().get("/", (c) =>
  c.json({ ok: true, last_sync_at: null, cookie_ok: false })
);
```

`server/index.ts`:

```ts
import { Hono } from "hono";
import { health } from "./routes/health.ts";

export const app = new Hono().basePath("/api").route("/health", health);

export type AppType = typeof app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 5173);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`server listening on http://localhost:${port}`);
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `bun test tests/api/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/ tests/
git commit -m "feat(server): hono skeleton with health route"
```

---

### Task 3: Vite + React + Tailwind frontend skeleton

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/tsconfig.json`
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.js`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/index.css`

- [ ] **Step 1: Initialize web/ as a Vite + React + TS app**

```bash
cd web
bun create vite@latest . -- --template react-ts
bun install
```

When the prompt asks about overwriting, accept it. After this, `cd ..`.

- [ ] **Step 2: Add Tailwind and shadcn deps**

```bash
cd web
bun add -d tailwindcss postcss autoprefixer
bun add -d @types/node
bun add @tanstack/react-query @tanstack/react-router clsx tailwind-merge
bunx tailwindcss init -p
cd ..
```

- [ ] **Step 3: Configure Tailwind**

`web/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`web/src/index.css` (replace contents):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Configure Vite to proxy /api to the Bun server**

`web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:5173",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 5: Initialize shadcn/ui**

```bash
cd web
bunx shadcn@latest init -d
bunx shadcn@latest add button input table badge dialog tabs sidebar toast
cd ..
```

Accept defaults except: style "default", base color "slate", CSS variables yes.

- [ ] **Step 6: Verify the dev server boots**

Run: `cd web && bun run dev`
Expected: Vite reports `Local: http://localhost:5174/`, the page renders the Vite React template. Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat(web): vite + react + tailwind + shadcn scaffold"
```

---

### Task 4: Static-serve the built web bundle from Hono in production

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add static-serve middleware**

Replace `server/index.ts` with:

```ts
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { health } from "./routes/health.ts";

const api = new Hono().route("/health", health);

export const app = new Hono()
  .route("/api", api)
  .use(
    "/*",
    serveStatic({
      root: "./web/dist",
      onNotFound: (path) => {
        if (path.startsWith("/api")) return;
      },
    })
  )
  .get("/*", serveStatic({ path: "./web/dist/index.html" }));

export type AppType = typeof app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 5173);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`server listening on http://localhost:${port}`);
}
```

- [ ] **Step 2: Verify the existing health test still passes**

Run: `bun test tests/api/health.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat(server): static-serve web/dist with SPA fallback"
```

---

## Phase 1 — Database

### Task 5: Drizzle schema for the four tables

**Files:**
- Create: `server/db/schema.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Write the schema**

`server/db/schema.ts`:

```ts
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  source: text("source", { enum: ["choice", "bundle", "store", "other"] }).notNull(),
  purchasedAt: integer("purchased_at"),
  url: text("url"),
  rawJson: text("raw_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  bundleId: text("bundle_id")
    .notNull()
    .references(() => bundles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  machineName: text("machine_name").notNull(),
  platform: text("platform", {
    enum: ["steam", "gog", "origin", "uplay", "drm-free", "other"],
  }).notNull(),
  status: text("status", { enum: ["unclaimed", "revealed", "redeemed"] }).notNull(),
  keyValue: text("key_value"),
  claimUrl: text("claim_url"),
  expiresAt: integer("expires_at"),
  notes: text("notes"),
  tags: text("tags"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  status: text("status", { enum: ["running", "ok", "error", "partial"] }).notNull(),
  bundlesSeen: integer("bundles_seen").notNull().default(0),
  itemsAdded: integer("items_added").notNull().default(0),
  itemsUpdated: integer("items_updated").notNull().default(0),
  error: text("error"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

- [ ] **Step 2: Write drizzle.config.ts**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./data/humble.db",
  },
} satisfies Config;
```

- [ ] **Step 3: Generate the initial migration**

```bash
mkdir -p data
bun run db:generate
```

Expected: `server/db/migrations/0000_xxx.sql` is created.

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.ts drizzle.config.ts server/db/migrations/
git commit -m "feat(db): drizzle schema for bundles/items/sync_runs/settings"
```

---

### Task 6: DB client + migration runner + FTS5 setup

**Files:**
- Create: `server/db/client.ts`
- Create: `server/db/migrate.ts`
- Create: `server/db/fts.ts`
- Create: `tests/db/fts.test.ts`

- [ ] **Step 1: Write the failing FTS test**

`tests/db/fts.test.ts`:

```ts
import { describe, expect, test, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { items, bundles } from "../../server/db/schema.ts";
import { setupFts, searchItems } from "../../server/db/fts.ts";

describe("fts5 search over items.name", () => {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);

  beforeAll(async () => {
    migrate(db, { migrationsFolder: "./server/db/migrations" });
    setupFts(sqlite);
    const now = Date.now();
    await db.insert(bundles).values({
      id: "b1",
      name: "Choice March 2024",
      source: "choice",
      rawJson: "{}",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(items).values([
      { id: "i1", bundleId: "b1", name: "Pacific Drive", machineName: "pacific_drive", platform: "steam", status: "unclaimed", createdAt: now, updatedAt: now },
      { id: "i2", bundleId: "b1", name: "Hades II", machineName: "hades_ii", platform: "steam", status: "unclaimed", createdAt: now, updatedAt: now },
    ]);
  });

  test("matches by partial name", () => {
    const ids = searchItems(sqlite, "pacific");
    expect(ids).toEqual(["i1"]);
  });

  test("returns empty for no match", () => {
    expect(searchItems(sqlite, "zzzyx")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test tests/db/fts.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement client + migrate + fts**

`server/db/client.ts`:

```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { setupFts } from "./fts.ts";

const dbPath = process.env.DB_PATH ?? "./data/humble.db";

if (dbPath !== ":memory:") {
  mkdirSync(dirname(dbPath), { recursive: true });
}

export const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./server/db/migrations" });
setupFts(sqlite);
```

`server/db/migrate.ts`:

```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { setupFts } from "./fts.ts";

const dbPath = process.env.DB_PATH ?? "./data/humble.db";

if (dbPath !== ":memory:") {
  mkdirSync(dirname(dbPath), { recursive: true });
}

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./server/db/migrations" });
setupFts(sqlite);
console.log("migrations applied");
```

`server/db/fts.ts`:

```ts
import type { Database } from "bun:sqlite";

export function setupFts(sqlite: Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      name, content='items', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, name) VALUES (new.rowid, new.name);
    END;
    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
    END;
    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
      INSERT INTO items_fts(rowid, name) VALUES (new.rowid, new.name);
    END;
  `);
}

export function searchItems(sqlite: Database, q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const query = `${trimmed.replace(/"/g, '""')}*`;
  const rows = sqlite
    .query<{ id: string }, [string]>(
      `SELECT i.id FROM items i
       JOIN items_fts ON items_fts.rowid = i.rowid
       WHERE items_fts MATCH ?
       ORDER BY rank`
    )
    .all(query);
  return rows.map((r) => r.id);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test tests/db/fts.test.ts`
Expected: PASS — both cases.

- [ ] **Step 5: Commit**

```bash
git add server/db/ tests/db/
git commit -m "feat(db): client, migration runner, FTS5 search"
```

---

## Phase 2 — Settings

### Task 7: Settings model + cookie storage

**Files:**
- Create: `server/db/settings.ts`
- Create: `server/routes/settings.ts`
- Modify: `server/index.ts` (mount route)
- Create: `tests/api/settings.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/settings.test.ts`:

```ts
import { describe, expect, test, beforeEach } from "bun:test";
import { app } from "../../server/index.ts";
import { sqlite } from "../../server/db/client.ts";

describe("settings routes", () => {
  beforeEach(() => {
    sqlite.exec("DELETE FROM settings");
  });

  test("GET /api/settings returns hasCookie=false initially", async () => {
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasCookie).toBe(false);
    expect(body.syncIntervalHours).toBe(6);
  });

  test("PUT /api/settings/cookie stores it; subsequent GET reports hasCookie=true", async () => {
    const put = await app.request("/api/settings/cookie", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cookie: "abc123" }),
    });
    expect(put.status).toBe(204);

    const res = await app.request("/api/settings");
    const body = await res.json();
    expect(body.hasCookie).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `bun test tests/api/settings.test.ts`
Expected: FAIL — settings route not mounted.

- [ ] **Step 3: Implement settings model**

`server/db/settings.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "./client.ts";
import { settings } from "./schema.ts";

const KEYS = {
  cookie: "humble_cookie",
  intervalHours: "sync_interval_hours",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const now = Date.now();
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    });
}

export const getCookie = () => getSetting(KEYS.cookie);
export const setCookie = (v: string) => setSetting(KEYS.cookie, v);

export async function getSyncIntervalHours(): Promise<number> {
  const v = await getSetting(KEYS.intervalHours);
  if (v === null) return 6;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

export const setSyncIntervalHours = (n: number) =>
  setSetting(KEYS.intervalHours, String(n));
```

- [ ] **Step 4: Implement route**

`server/routes/settings.ts`:

```ts
import { Hono } from "hono";
import {
  getCookie,
  setCookie,
  getSyncIntervalHours,
  setSyncIntervalHours,
} from "../db/settings.ts";

export const settingsRoutes = new Hono()
  .get("/", async (c) => {
    const [cookie, syncIntervalHours] = await Promise.all([
      getCookie(),
      getSyncIntervalHours(),
    ]);
    return c.json({
      hasCookie: cookie !== null && cookie.length > 0,
      syncIntervalHours,
    });
  })
  .put("/cookie", async (c) => {
    const body = (await c.req.json()) as { cookie?: unknown };
    if (typeof body.cookie !== "string" || body.cookie.length === 0) {
      return c.json({ error: "cookie must be a non-empty string" }, 400);
    }
    await setCookie(body.cookie);
    return c.body(null, 204);
  })
  .put("/", async (c) => {
    const body = (await c.req.json()) as { syncIntervalHours?: unknown };
    const v = body.syncIntervalHours;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return c.json({ error: "syncIntervalHours must be a positive number" }, 400);
    }
    await setSyncIntervalHours(v);
    return c.body(null, 204);
  });
```

- [ ] **Step 5: Mount in server/index.ts**

In `server/index.ts`, change the `api` definition:

```ts
import { settingsRoutes } from "./routes/settings.ts";
// ...
const api = new Hono()
  .route("/health", health)
  .route("/settings", settingsRoutes);
```

- [ ] **Step 6: Run tests to confirm pass**

Run: `bun test tests/api/settings.test.ts`
Expected: PASS — both cases.

- [ ] **Step 7: Commit**

```bash
git add server/db/settings.ts server/routes/settings.ts server/index.ts tests/api/settings.test.ts
git commit -m "feat(api): settings routes + cookie storage"
```

---

## Phase 3 — Fetcher

### Task 8: Fetcher interface + Playwright stub

**Files:**
- Create: `server/fetcher/types.ts`
- Create: `server/fetcher/playwright.ts`
- Create: `tests/fetcher/playwright.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/fetcher/playwright.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { PlaywrightFetcher } from "../../server/fetcher/playwright.ts";

describe("PlaywrightFetcher (stub)", () => {
  test("sync() throws NotImplemented", async () => {
    const f = new PlaywrightFetcher();
    await expect(f.sync({})).rejects.toThrow(/not implemented/i);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `bun test tests/fetcher/playwright.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement types and stub**

`server/fetcher/types.ts`:

```ts
export type SyncReport = {
  startedAt: number;
  finishedAt: number;
  status: "ok" | "error" | "partial";
  bundlesSeen: number;
  itemsAdded: number;
  itemsUpdated: number;
  error: string | null;
};

export type SyncOpts = {
  since?: Date;
};

export interface Fetcher {
  sync(opts: SyncOpts): Promise<SyncReport>;
}

export class CookieExpiredError extends Error {
  constructor() {
    super("Humble cookie expired or invalid");
    this.name = "CookieExpiredError";
  }
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} not implemented`);
    this.name = "NotImplementedError";
  }
}
```

`server/fetcher/playwright.ts`:

```ts
import type { Fetcher, SyncOpts, SyncReport } from "./types.ts";
import { NotImplementedError } from "./types.ts";

export class PlaywrightFetcher implements Fetcher {
  async sync(_opts: SyncOpts): Promise<SyncReport> {
    throw new NotImplementedError("PlaywrightFetcher.sync");
  }
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `bun test tests/fetcher/playwright.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/fetcher/ tests/fetcher/
git commit -m "feat(fetcher): types and PlaywrightFetcher stub"
```

---

### Task 9: Capture real Humble JSON fixtures (manual prerequisite, no code commit)

**Files:**
- Create: `tests/fetcher/fixtures/.gitkeep`
- Create: `scripts/capture-fixtures.ts`

This task captures real responses from Humble using the user's cookie so the parser can be developed against ground-truth data. The captured fixtures are sanitized (names/emails/keys redacted) and committed.

- [ ] **Step 1: Write the capture script**

`scripts/capture-fixtures.ts`:

```ts
import { writeFile, mkdir } from "node:fs/promises";

const cookie = process.env.HUMBLE_COOKIE;
if (!cookie) {
  console.error("Set HUMBLE_COOKIE env var to your _simpleauth_sess value");
  process.exit(1);
}

const headers = {
  Cookie: `_simpleauth_sess=${cookie}`,
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json",
};

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function sanitize(data: unknown): unknown {
  return JSON.parse(
    JSON.stringify(data).replace(
      /("redeemed_key_val":\s*")[^"]+(")/g,
      '$1REDACTED$2'
    ).replace(
      /("[a-z_]*email[a-z_]*":\s*")[^"]+(")/gi,
      '$1redacted@example.com$2'
    )
  );
}

await mkdir("tests/fetcher/fixtures", { recursive: true });

const orders = await get("https://www.humblebundle.com/api/v1/user/order");
await writeFile(
  "tests/fetcher/fixtures/orders-list.json",
  JSON.stringify(sanitize(orders), null, 2)
);
console.log(`captured ${(orders as unknown[]).length} order keys`);

const subs = await get(
  "https://www.humblebundle.com/api/v1/subscriptions/humble_monthly/subscription_products_with_gamekeys"
);
await writeFile(
  "tests/fetcher/fixtures/subscriptions-list.json",
  JSON.stringify(sanitize(subs), null, 2)
);

const firstKey = (orders as Array<{ gamekey: string }>)[0]?.gamekey;
if (firstKey) {
  const detail = await get(
    `https://www.humblebundle.com/api/v1/orders/${firstKey}?all_tpkds=true`
  );
  await writeFile(
    `tests/fetcher/fixtures/order-${firstKey}.json`,
    JSON.stringify(sanitize(detail), null, 2)
  );
  console.log(`captured detail for order ${firstKey}`);
}
```

- [ ] **Step 2: Run the capture (requires user-provided cookie)**

```bash
HUMBLE_COOKIE='paste-your-cookie-here' bun run scripts/capture-fixtures.ts
```

Expected: three JSON files in `tests/fetcher/fixtures/`.

If the script returns 401 or HTML, the cookie is wrong or expired — get a fresh one before continuing.

- [ ] **Step 3: Eyeball the fixtures and confirm structure**

Open `tests/fetcher/fixtures/orders-list.json`. Confirm it's an array of `{ gamekey: string }` objects.

Open `tests/fetcher/fixtures/order-*.json`. Confirm it has top-level `product`, `tpkd_dict`, `subproducts`, `created` fields. Note the actual shapes — the parser in Task 10 must match what's *actually* there.

- [ ] **Step 4: Commit fixtures and script**

```bash
git add scripts/capture-fixtures.ts tests/fetcher/fixtures/
git commit -m "test(fetcher): capture real Humble JSON fixtures (sanitized)"
```

---

### Task 10: Parser (Humble JSON → schema rows)

**Files:**
- Create: `server/fetcher/parse.ts`
- Create: `tests/fetcher/parse.test.ts`

The parser is the highest-value unit-tested piece. It runs against fixtures from Task 9 and produces `bundles` and `items` rows ready for upsert.

- [ ] **Step 1: Write a failing test using the captured fixture**

`tests/fetcher/parse.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { parseOrder } from "../../server/fetcher/parse.ts";

const fixtureDir = "tests/fetcher/fixtures";
const orderFile = readdirSync(fixtureDir).find((f) => f.startsWith("order-"));
if (!orderFile) throw new Error("Run Task 9 to capture order fixtures first");
const fixture = JSON.parse(readFileSync(`${fixtureDir}/${orderFile}`, "utf8"));

describe("parseOrder", () => {
  test("returns a bundle row with stable id and name", () => {
    const { bundle } = parseOrder(fixture);
    expect(bundle.id).toBeTruthy();
    expect(bundle.name).toBeTruthy();
    expect(["choice", "bundle", "store", "other"]).toContain(bundle.source);
    expect(bundle.rawJson).toBe(JSON.stringify(fixture));
  });

  test("returns at least one item row", () => {
    const { items } = parseOrder(fixture);
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.bundleId).toBeTruthy();
    expect(first.machineName).toBeTruthy();
    expect(first.name).toBeTruthy();
    expect(["unclaimed", "revealed", "redeemed"]).toContain(first.status);
  });

  test("item id is stable across runs", () => {
    const a = parseOrder(fixture);
    const b = parseOrder(fixture);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `bun test tests/fetcher/parse.test.ts`
Expected: FAIL — `parse.ts` doesn't exist.

- [ ] **Step 3: Implement the parser**

NOTE TO IMPLEMENTER: The exact field names below are best-effort guesses from public reverse-engineering. Open the fixture from Task 9, confirm each field name matches, and adjust this code accordingly before running tests.

`server/fetcher/parse.ts`:

```ts
import { createHash } from "node:crypto";

type RawOrder = {
  gamekey: string;
  created?: string;
  product?: { human_name?: string; machine_name?: string; category?: string };
  subproducts?: Array<{
    machine_name: string;
    human_name: string;
    url?: string;
    payee?: { human_name?: string };
    downloads?: Array<{ platform?: string }>;
  }>;
  tpkd_dict?: {
    all_tpks?: Array<{
      machine_name: string;
      human_name: string;
      key_type?: string;
      key_type_human_name?: string;
      redeemed_key_val?: string | null;
      expiration_date_string?: string | null;
      gamekey?: string;
      sold_out?: boolean;
      is_gift?: boolean;
    }>;
  };
};

export type ParsedBundle = {
  id: string;
  name: string;
  source: "choice" | "bundle" | "store" | "other";
  purchasedAt: number | null;
  url: string | null;
  rawJson: string;
};

export type ParsedItem = {
  id: string;
  bundleId: string;
  name: string;
  machineName: string;
  platform: "steam" | "gog" | "origin" | "uplay" | "drm-free" | "other";
  status: "unclaimed" | "revealed" | "redeemed";
  keyValue: string | null;
  claimUrl: string | null;
  expiresAt: number | null;
};

export type ParseResult = {
  bundle: ParsedBundle;
  items: ParsedItem[];
};

const PLATFORM_MAP: Record<string, ParsedItem["platform"]> = {
  steam: "steam",
  gog: "gog",
  origin: "origin",
  uplay: "uplay",
  ubisoft_connect: "uplay",
};

function classifySource(raw: RawOrder): ParsedBundle["source"] {
  const cat = raw.product?.category?.toLowerCase() ?? "";
  const name = raw.product?.human_name?.toLowerCase() ?? "";
  if (cat.includes("subscription") || name.includes("humble choice") || name.includes("humble monthly")) {
    return "choice";
  }
  if (cat.includes("bundle")) return "bundle";
  if (cat.includes("storefront")) return "store";
  return "other";
}

function classifyPlatform(keyType: string | undefined, downloads: Array<{ platform?: string }> | undefined): ParsedItem["platform"] {
  const k = keyType?.toLowerCase() ?? "";
  if (k && PLATFORM_MAP[k]) return PLATFORM_MAP[k]!;
  const d = downloads?.[0]?.platform?.toLowerCase();
  if (d === "windows" || d === "mac" || d === "linux" || d === "audio" || d === "ebook") return "drm-free";
  return "other";
}

function classifyStatus(tpk: NonNullable<RawOrder["tpkd_dict"]>["all_tpks"] extends Array<infer T> ? T : never): ParsedItem["status"] {
  if (tpk.redeemed_key_val) return "revealed";
  return "unclaimed";
}

function hashId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function parseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

export function parseOrder(raw: RawOrder): ParseResult {
  const bundleId = raw.gamekey;
  const bundle: ParsedBundle = {
    id: bundleId,
    name: raw.product?.human_name ?? `Order ${bundleId}`,
    source: classifySource(raw),
    purchasedAt: parseDate(raw.created),
    url: bundleId ? `https://www.humblebundle.com/downloads?key=${bundleId}` : null,
    rawJson: JSON.stringify(raw),
  };

  const items: ParsedItem[] = [];

  // Items with keys (Steam, GOG, etc.)
  for (const tpk of raw.tpkd_dict?.all_tpks ?? []) {
    items.push({
      id: hashId(bundleId, tpk.machine_name),
      bundleId,
      name: tpk.human_name,
      machineName: tpk.machine_name,
      platform: classifyPlatform(tpk.key_type, undefined),
      status: classifyStatus(tpk),
      keyValue: tpk.redeemed_key_val ?? null,
      claimUrl: bundle.url,
      expiresAt: parseDate(tpk.expiration_date_string),
    });
  }

  // DRM-free subproducts not already covered by tpkd
  const seenMachineNames = new Set(items.map((i) => i.machineName));
  for (const sp of raw.subproducts ?? []) {
    if (seenMachineNames.has(sp.machine_name)) continue;
    items.push({
      id: hashId(bundleId, sp.machine_name),
      bundleId,
      name: sp.human_name,
      machineName: sp.machine_name,
      platform: classifyPlatform(undefined, sp.downloads),
      status: "revealed",
      keyValue: null,
      claimUrl: sp.url ?? bundle.url,
      expiresAt: null,
    });
  }

  return { bundle, items };
}
```

- [ ] **Step 4: Run tests, confirm they pass against the real fixture**

Run: `bun test tests/fetcher/parse.test.ts`
Expected: PASS — all three tests.

If any test fails, the parser needs adjustment to match the actual JSON. Inspect the fixture and update the field names. Repeat until tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/fetcher/parse.ts tests/fetcher/parse.test.ts
git commit -m "feat(fetcher): parse Humble order JSON into bundle and item rows"
```

---

### Task 11: CookieFetcher implementation

**Files:**
- Create: `server/fetcher/cookie.ts`
- Create: `server/fetcher/upsert.ts`
- Create: `tests/fetcher/upsert.test.ts`

- [ ] **Step 1: Write the failing upsert test**

`tests/fetcher/upsert.test.ts`:

```ts
import { describe, expect, test, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { sqlite, db } from "../../server/db/client.ts";
import { items, bundles } from "../../server/db/schema.ts";
import { upsertParsed } from "../../server/fetcher/upsert.ts";
import type { ParseResult } from "../../server/fetcher/parse.ts";

const fixture: ParseResult = {
  bundle: {
    id: "test-bundle-1",
    name: "Test Bundle",
    source: "choice",
    purchasedAt: 1700000000000,
    url: "https://example",
    rawJson: "{}",
  },
  items: [
    {
      id: "item-1",
      bundleId: "test-bundle-1",
      name: "Test Game",
      machineName: "test_game",
      platform: "steam",
      status: "unclaimed",
      keyValue: null,
      claimUrl: null,
      expiresAt: null,
    },
  ],
};

describe("upsertParsed", () => {
  beforeEach(() => {
    sqlite.exec("DELETE FROM items; DELETE FROM bundles;");
  });

  test("inserts new bundle and items, reports counts", async () => {
    const r = await upsertParsed([fixture]);
    expect(r.itemsAdded).toBe(1);
    expect(r.itemsUpdated).toBe(0);
    const rows = await db.select().from(items).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("unclaimed");
  });

  test("re-running with same data updates, does not duplicate", async () => {
    await upsertParsed([fixture]);
    const r = await upsertParsed([fixture]);
    expect(r.itemsAdded).toBe(0);
    expect(r.itemsUpdated).toBe(1);
    const rows = await db.select().from(items).all();
    expect(rows.length).toBe(1);
  });

  test("preserves user-edited notes/tags across upserts", async () => {
    await upsertParsed([fixture]);
    sqlite.exec("UPDATE items SET notes = 'mine', tags = 'roguelike' WHERE id = 'item-1'");
    await upsertParsed([fixture]);
    const row = await db.select().from(items).where(eq(items.id, "item-1")).get();
    expect(row?.notes).toBe("mine");
    expect(row?.tags).toBe("roguelike");
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `bun test tests/fetcher/upsert.test.ts`
Expected: FAIL — `upsert.ts` missing.

- [ ] **Step 3: Implement upsert**

`server/fetcher/upsert.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { bundles, items } from "../db/schema.ts";
import type { ParseResult } from "./parse.ts";

export type UpsertCounts = {
  bundlesSeen: number;
  itemsAdded: number;
  itemsUpdated: number;
};

export async function upsertParsed(results: ParseResult[]): Promise<UpsertCounts> {
  const now = Date.now();
  let added = 0;
  let updated = 0;

  for (const { bundle, items: parsedItems } of results) {
    await db
      .insert(bundles)
      .values({ ...bundle, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: bundles.id,
        set: {
          name: bundle.name,
          source: bundle.source,
          purchasedAt: bundle.purchasedAt,
          url: bundle.url,
          rawJson: bundle.rawJson,
          updatedAt: now,
        },
      });

    for (const it of parsedItems) {
      // Detect insert vs update by checking existence first. We can't rely on
      // a CASE-on-createdAt trick because `now` may equal the prior row's
      // createdAt when two upserts run in the same millisecond.
      const existing = await db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.id, it.id))
        .get();

      await db
        .insert(items)
        .values({ ...it, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: items.id,
          set: {
            // Refresh fields that come from Humble; do NOT touch notes/tags.
            name: it.name,
            machineName: it.machineName,
            platform: it.platform,
            status: sql`CASE WHEN ${items.status} = 'redeemed' THEN ${items.status} ELSE ${it.status} END`,
            keyValue: it.keyValue,
            claimUrl: it.claimUrl,
            expiresAt: it.expiresAt,
            updatedAt: now,
          },
        });

      if (existing) updated++;
      else added++;
    }
  }

  return { bundlesSeen: results.length, itemsAdded: added, itemsUpdated: updated };
}
```

NOTE: The `redeemed` clause keeps a user's manual `redeemed` toggle even if Humble still reports the key as merely revealed.

- [ ] **Step 4: Run upsert tests**

Run: `bun test tests/fetcher/upsert.test.ts`
Expected: PASS — all three.

- [ ] **Step 5: Implement CookieFetcher**

`server/fetcher/cookie.ts`:

```ts
import type { Fetcher, SyncOpts, SyncReport } from "./types.ts";
import { CookieExpiredError } from "./types.ts";
import { parseOrder } from "./parse.ts";
import { upsertParsed } from "./upsert.ts";
import { getCookie } from "../db/settings.ts";

const BASE = "https://www.humblebundle.com";
const CONCURRENCY = 5;

async function pmap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// Humble's subscriptions endpoint returns { cursor, products: [...] } rather
// than a bare array, so we extract gamekeys defensively across both shapes.
function extractGamekeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((o) =>
        typeof o === "object" && o !== null ? (o as { gamekey?: unknown }).gamekey : null,
      )
      .filter((k): k is string => typeof k === "string");
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as { products?: unknown; gamekeys?: unknown };
    if (Array.isArray(obj.products)) return extractGamekeys(obj.products);
    if (Array.isArray(obj.gamekeys))
      return obj.gamekeys.filter((k): k is string => typeof k === "string");
  }
  return [];
}

export class CookieFetcher implements Fetcher {
  async sync(_opts: SyncOpts): Promise<SyncReport> {
    const startedAt = Date.now();
    const cookie = await getCookie();
    if (!cookie) throw new CookieExpiredError();

    const headers: HeadersInit = {
      Cookie: `_simpleauth_sess=${cookie}`,
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    };

    const fetchJson = async (path: string): Promise<unknown> => {
      const res = await fetch(`${BASE}${path}`, { headers });
      if (res.status === 401 || res.status === 302) throw new CookieExpiredError();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) throw new CookieExpiredError();
      return res.json();
    };

    // List all order gamekeys (also serves as the cookie health check —
    // 401/non-JSON throws CookieExpiredError).
    const orders = await fetchJson("/api/v1/user/order");
    // Plus monthly subscription products.
    const subs = await fetchJson(
      "/api/v1/subscriptions/humble_monthly/subscription_products_with_gamekeys",
    );
    const allKeys = Array.from(
      new Set([...extractGamekeys(orders), ...extractGamekeys(subs)]),
    );

    // 4. fetch + parse each, tolerating per-order failures.
    // The order-detail endpoint is singular `/order/`, not plural — the plural
    // form 404s for every key.
    let partial = false;
    const errors: string[] = [];
    const parsed = await pmap(allKeys, CONCURRENCY, async (key) => {
      try {
        const detail = await fetchJson(`/api/v1/order/${key}?all_tpkds=true`);
        return parseOrder(detail as Parameters<typeof parseOrder>[0]);
      } catch (e) {
        partial = true;
        errors.push(`${key}: ${(e as Error).message}`);
        return null;
      }
    });

    const valid = parsed.filter((p): p is NonNullable<typeof p> => p !== null);
    const counts = await upsertParsed(valid);

    // Distinguish total-failure from partial-success: if every key errored
    // we want "error", not "partial".
    let status: SyncReport["status"];
    if (allKeys.length === 0) {
      status = "ok"; // nothing to fetch is success, not error
    } else if (errors.length === allKeys.length) {
      status = "error"; // every order failed
    } else if (partial) {
      status = "partial"; // some succeeded, some failed
    } else {
      status = "ok"; // all succeeded
    }

    return {
      startedAt,
      finishedAt: Date.now(),
      status,
      bundlesSeen: counts.bundlesSeen,
      itemsAdded: counts.itemsAdded,
      itemsUpdated: counts.itemsUpdated,
      error: errors.length ? formatErrors(errors) : null,
    };
  }
}

function formatErrors(errors: string[]): string {
  const MAX = 20;
  if (errors.length <= MAX) return errors.join("; ");
  return `${errors.slice(0, MAX).join("; ")}; ...and ${errors.length - MAX} more`;
}
```

- [ ] **Step 6: Commit**

```bash
git add server/fetcher/cookie.ts server/fetcher/upsert.ts tests/fetcher/upsert.test.ts
git commit -m "feat(fetcher): cookie-based fetcher and idempotent upsert"
```

---

### Task 12: Sync runner (single-flight) + scheduler

**Files:**
- Create: `server/fetcher/factory.ts`
- Create: `server/sync/runner.ts`
- Create: `server/sync/scheduler.ts`
- Create: `tests/sync/runner.test.ts`

- [ ] **Step 1: Write the failing test for single-flight behavior**

`tests/sync/runner.test.ts`:

```ts
import { describe, expect, test, beforeEach } from "bun:test";
import { sqlite, db } from "../../server/db/client.ts";
import { syncRuns } from "../../server/db/schema.ts";
import { SyncRunner } from "../../server/sync/runner.ts";
import type { Fetcher, SyncReport } from "../../server/fetcher/types.ts";

class StubFetcher implements Fetcher {
  calls = 0;
  delayMs = 50;
  async sync(): Promise<SyncReport> {
    this.calls++;
    await new Promise((r) => setTimeout(r, this.delayMs));
    return {
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: "ok",
      bundlesSeen: 0,
      itemsAdded: 0,
      itemsUpdated: 0,
      error: null,
    };
  }
}

describe("SyncRunner", () => {
  beforeEach(() => sqlite.exec("DELETE FROM sync_runs"));

  test("runs sync once per kick when not in flight", async () => {
    const stub = new StubFetcher();
    const runner = new SyncRunner(stub);
    await runner.kick();
    await runner.waitForIdle();
    expect(stub.calls).toBe(1);
  });

  test("two concurrent kicks share one run (single-flight)", async () => {
    const stub = new StubFetcher();
    const runner = new SyncRunner(stub);
    const a = runner.kick();
    const b = runner.kick();
    expect(a).toBe(b);
    await runner.waitForIdle();
    expect(stub.calls).toBe(1);
  });

  test("writes a sync_runs row on success", async () => {
    const stub = new StubFetcher();
    const runner = new SyncRunner(stub);
    await runner.kick();
    await runner.waitForIdle();
    const rows = await db.select().from(syncRuns).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("ok");
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `bun test tests/sync/runner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement factory + runner + scheduler**

`server/fetcher/factory.ts`:

```ts
import { CookieFetcher } from "./cookie.ts";
import { PlaywrightFetcher } from "./playwright.ts";
import type { Fetcher } from "./types.ts";

export function makeFetcher(): Fetcher {
  const mode = process.env.FETCHER_MODE ?? "cookie";
  if (mode === "playwright") return new PlaywrightFetcher();
  return new CookieFetcher();
}
```

`server/sync/runner.ts`:

```ts
import { db } from "../db/client.ts";
import { syncRuns } from "../db/schema.ts";
import type { Fetcher, SyncReport } from "../fetcher/types.ts";
import { CookieExpiredError } from "../fetcher/types.ts";
import { eq } from "drizzle-orm";

export class SyncRunner {
  private inFlight: Promise<{ runId: number }> | null = null;

  constructor(private fetcher: Fetcher) {}

  kick(): Promise<{ runId: number }> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  isRunning(): boolean {
    return this.inFlight !== null;
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight.catch(() => {});
  }

  private async run(): Promise<{ runId: number }> {
    const startedAt = Date.now();
    const inserted = await db
      .insert(syncRuns)
      .values({ startedAt, status: "running" })
      .returning({ id: syncRuns.id })
      .get();
    const runId = inserted!.id;

    let report: SyncReport;
    try {
      report = await this.fetcher.sync({});
    } catch (e) {
      const err = e as Error;
      const status = err instanceof CookieExpiredError ? "error" : "error";
      await db
        .update(syncRuns)
        .set({
          finishedAt: Date.now(),
          status,
          error: err.message,
        })
        .where(eq(syncRuns.id, runId));
      return { runId };
    }

    await db
      .update(syncRuns)
      .set({
        finishedAt: report.finishedAt,
        status: report.status,
        bundlesSeen: report.bundlesSeen,
        itemsAdded: report.itemsAdded,
        itemsUpdated: report.itemsUpdated,
        error: report.error,
      })
      .where(eq(syncRuns.id, runId));
    return { runId };
  }
}

let _shared: SyncRunner | null = null;
export function initSharedRunner(fetcher: Fetcher): SyncRunner {
  if (_shared) throw new Error("shared runner already initialized");
  _shared = new SyncRunner(fetcher);
  return _shared;
}
export function getSharedRunner(): SyncRunner {
  if (!_shared) throw new Error("shared runner not initialized; call initSharedRunner first");
  return _shared;
}
```

`server/sync/scheduler.ts`:

```ts
import { desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncRuns } from "../db/schema.ts";
import { getSyncIntervalHours, getCookie } from "../db/settings.ts";
import type { SyncRunner } from "./runner.ts";

export async function maybeKickStaleSync(runner: SyncRunner): Promise<void> {
  const cookie = await getCookie();
  if (!cookie) return;
  const last = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
    .get();
  if (!last) {
    runner.kick().catch((e) => console.error("scheduled sync failed", e));
    return;
  }
  const intervalMs = (await getSyncIntervalHours()) * 60 * 60 * 1000;
  if (Date.now() - last.startedAt > intervalMs) {
    runner.kick().catch((e) => console.error("scheduled sync failed", e));
  }
}
```

- [ ] **Step 4: Run runner tests**

Run: `bun test tests/sync/runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/fetcher/factory.ts server/sync/ tests/sync/
git commit -m "feat(sync): single-flight runner + on-launch scheduler"
```

---

### Task 13: Sync API routes + wire to startup

**Files:**
- Create: `server/routes/sync.ts`
- Modify: `server/index.ts`
- Create: `tests/api/sync.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/sync.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { app } from "../../server/index.ts";

describe("sync routes", () => {
  test("GET /api/sync/status returns running=false initially", async () => {
    const res = await app.request("/api/sync/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.running).toBe(false);
  });

  test("GET /api/sync/runs returns an array", async () => {
    const res = await app.request("/api/sync/runs");
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `bun test tests/api/sync.test.ts`
Expected: FAIL — routes not mounted.

- [ ] **Step 3: Implement sync routes**

`server/routes/sync.ts`:

```ts
import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncRuns } from "../db/schema.ts";
import type { SyncRunner } from "../sync/runner.ts";

export function syncRoutes(runner: SyncRunner) {
  return new Hono()
    .post("/", async (c) => {
      const { runId } = await runner.kick();
      return c.json({ runId });
    })
    .get("/status", async (c) => {
      const last = await db
        .select()
        .from(syncRuns)
        .orderBy(desc(syncRuns.startedAt))
        .limit(1)
        .get();
      return c.json({ running: runner.isRunning(), last: last ?? null });
    })
    .get("/runs", async (c) => {
      const rows = await db
        .select()
        .from(syncRuns)
        .orderBy(desc(syncRuns.startedAt))
        .limit(20)
        .all();
      return c.json(rows);
    });
}
```

- [ ] **Step 4: Wire into server**

Replace `server/index.ts`:

```ts
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { health } from "./routes/health.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { syncRoutes } from "./routes/sync.ts";
import { makeFetcher } from "./fetcher/factory.ts";
import { initSharedRunner } from "./sync/runner.ts";
import { maybeKickStaleSync } from "./sync/scheduler.ts";

const runner = initSharedRunner(makeFetcher());

const api = new Hono()
  .route("/health", health)
  .route("/settings", settingsRoutes)
  .route("/sync", syncRoutes(runner));

export const app = new Hono()
  .route("/api", api)
  .use(
    "/*",
    serveStatic({
      root: "./web/dist",
      onNotFound: (path) => {
        if (path.startsWith("/api")) return;
      },
    })
  )
  .get("/*", serveStatic({ path: "./web/dist/index.html" }));

export type AppType = typeof app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 5173);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`server listening on http://localhost:${port}`);
  maybeKickStaleSync(runner).catch((e) => console.error("startup sync failed", e));
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test tests/api/sync.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/sync.ts server/index.ts tests/api/sync.test.ts
git commit -m "feat(api): sync routes and on-launch staleness check"
```

---

## Phase 4 — Items + Bundles API

### Task 14: Items routes (list with filters, get, patch)

**Files:**
- Create: `server/routes/items.ts`
- Modify: `server/index.ts`
- Create: `tests/api/items.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/api/items.test.ts`:

```ts
import { describe, expect, test, beforeAll } from "bun:test";
import { app } from "../../server/index.ts";
import { sqlite, db } from "../../server/db/client.ts";
import { bundles, items } from "../../server/db/schema.ts";

describe("items routes", () => {
  beforeAll(async () => {
    sqlite.exec("DELETE FROM items; DELETE FROM bundles;");
    const now = Date.now();
    await db.insert(bundles).values({
      id: "b1", name: "Choice", source: "choice", rawJson: "{}", createdAt: now, updatedAt: now,
    });
    await db.insert(items).values([
      { id: "a", bundleId: "b1", name: "Pacific Drive", machineName: "pd", platform: "steam", status: "unclaimed", expiresAt: Date.now() + 86_400_000, createdAt: now, updatedAt: now },
      { id: "b", bundleId: "b1", name: "Hades II", machineName: "h2", platform: "steam", status: "revealed", createdAt: now, updatedAt: now },
      { id: "c", bundleId: "b1", name: "Old Game", machineName: "og", platform: "gog", status: "redeemed", createdAt: now, updatedAt: now },
    ]);
  });

  test("GET /api/items returns all items", async () => {
    const res = await app.request("/api/items");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(3);
  });

  test("GET /api/items?status=unclaimed filters", async () => {
    const res = await app.request("/api/items?status=unclaimed");
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].id).toBe("a");
  });

  test("GET /api/items?platform=gog filters", async () => {
    const res = await app.request("/api/items?platform=gog");
    const body = await res.json();
    expect(body.length).toBe(1);
  });

  test("GET /api/items?q=pacific uses FTS", async () => {
    const res = await app.request("/api/items?q=pacific");
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].id).toBe("a");
  });

  test("PATCH /api/items/:id updates notes", async () => {
    const res = await app.request("/api/items/a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "test note" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("test note");
  });

  test("PATCH /api/items/:id can mark redeemed", async () => {
    const res = await app.request("/api/items/b", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "redeemed" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("redeemed");
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `bun test tests/api/items.test.ts`
Expected: FAIL — items routes missing.

- [ ] **Step 3: Implement items routes**

`server/routes/items.ts`:

```ts
import { Hono } from "hono";
import { and, eq, inArray, isNotNull, lte, asc, desc } from "drizzle-orm";
import { db, sqlite } from "../db/client.ts";
import { items } from "../db/schema.ts";
import { searchItems } from "../db/fts.ts";

const PLATFORMS = ["steam", "gog", "origin", "uplay", "drm-free", "other"] as const;
const STATUSES = ["unclaimed", "revealed", "redeemed", "expired"] as const;

export const itemsRoutes = new Hono()
  .get("/", async (c) => {
    const q = c.req.query("q");
    const platform = c.req.query("platform");
    const status = c.req.query("status");
    const expiringWithin = c.req.query("expiringWithin");
    const bundleId = c.req.query("bundleId");
    const sort = c.req.query("sort") ?? "name";

    const conds = [];
    if (platform && (PLATFORMS as readonly string[]).includes(platform)) {
      conds.push(eq(items.platform, platform as (typeof PLATFORMS)[number]));
    }
    if (status === "expired") {
      conds.push(and(isNotNull(items.expiresAt), lte(items.expiresAt, Date.now()))!);
    } else if (status && (STATUSES as readonly string[]).includes(status)) {
      conds.push(eq(items.status, status as Exclude<(typeof STATUSES)[number], "expired">));
    }
    if (expiringWithin) {
      const ms = Number(expiringWithin) * 86_400_000;
      conds.push(and(isNotNull(items.expiresAt), lte(items.expiresAt, Date.now() + ms))!);
    }
    if (bundleId) conds.push(eq(items.bundleId, bundleId));

    if (q) {
      const ids = searchItems(sqlite, q);
      if (!ids.length) return c.json([]);
      conds.push(inArray(items.id, ids));
    }

    const orderCol =
      sort === "expiresAt" ? items.expiresAt : sort === "bundleDate" ? items.createdAt : items.name;
    const rows = await db
      .select()
      .from(items)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(orderCol))
      .all();
    return c.json(rows);
  })
  .get("/:id", async (c) => {
    const row = await db.select().from(items).where(eq(items.id, c.req.param("id"))).get();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as {
      status?: string;
      notes?: string;
      tags?: string;
    };
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (body.status && (["unclaimed", "revealed", "redeemed"] as const).includes(body.status as never)) {
      patch.status = body.status;
    }
    if (typeof body.notes === "string") patch.notes = body.notes;
    if (typeof body.tags === "string") patch.tags = body.tags;
    await db.update(items).set(patch).where(eq(items.id, id));
    const row = await db.select().from(items).where(eq(items.id, id)).get();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });
```

- [ ] **Step 4: Mount in server/index.ts**

In `server/index.ts`, add to the `api` chain:

```ts
import { itemsRoutes } from "./routes/items.ts";
// ...
const api = new Hono()
  .route("/health", health)
  .route("/settings", settingsRoutes)
  .route("/items", itemsRoutes)
  .route("/sync", syncRoutes(runner));
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/api/items.test.ts`
Expected: PASS — all six.

- [ ] **Step 6: Commit**

```bash
git add server/routes/items.ts server/index.ts tests/api/items.test.ts
git commit -m "feat(api): items list/get/patch with filters and FTS"
```

---

### Task 15: Bundles routes

**Files:**
- Create: `server/routes/bundles.ts`
- Modify: `server/index.ts`
- Create: `tests/api/bundles.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/api/bundles.test.ts`:

```ts
import { describe, expect, test, beforeAll } from "bun:test";
import { app } from "../../server/index.ts";
import { sqlite, db } from "../../server/db/client.ts";
import { bundles, items } from "../../server/db/schema.ts";

describe("bundles routes", () => {
  beforeAll(async () => {
    sqlite.exec("DELETE FROM items; DELETE FROM bundles;");
    const now = Date.now();
    await db.insert(bundles).values([
      { id: "b1", name: "Choice March 2024", source: "choice", purchasedAt: 1709251200000, rawJson: "{}", createdAt: now, updatedAt: now },
      { id: "b2", name: "Trifecta Bundle", source: "bundle", purchasedAt: 1700000000000, rawJson: "{}", createdAt: now, updatedAt: now },
    ]);
    await db.insert(items).values([
      { id: "i1", bundleId: "b1", name: "G1", machineName: "g1", platform: "steam", status: "unclaimed", createdAt: now, updatedAt: now },
    ]);
  });

  test("GET /api/bundles returns both", async () => {
    const res = await app.request("/api/bundles");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(2);
  });

  test("GET /api/bundles/:id returns bundle and its items", async () => {
    const res = await app.request("/api/bundles/b1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bundle.id).toBe("b1");
    expect(body.items.length).toBe(1);
  });

  test("GET /api/bundles/:id 404s on missing", async () => {
    const res = await app.request("/api/bundles/nope");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `bun test tests/api/bundles.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement bundles routes**

`server/routes/bundles.ts`:

```ts
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { bundles, items } from "../db/schema.ts";

export const bundlesRoutes = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(bundles)
      .orderBy(desc(bundles.purchasedAt))
      .all();
    return c.json(rows);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const bundle = await db.select().from(bundles).where(eq(bundles.id, id)).get();
    if (!bundle) return c.json({ error: "not found" }, 404);
    const bundleItems = await db.select().from(items).where(eq(items.bundleId, id)).all();
    return c.json({ bundle, items: bundleItems });
  });
```

- [ ] **Step 4: Mount in server/index.ts**

```ts
import { bundlesRoutes } from "./routes/bundles.ts";
// ...
const api = new Hono()
  .route("/health", health)
  .route("/settings", settingsRoutes)
  .route("/items", itemsRoutes)
  .route("/bundles", bundlesRoutes)
  .route("/sync", syncRoutes(runner));
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/api/bundles.test.ts`
Expected: PASS — all three.

- [ ] **Step 6: Update health route to report cookie + last sync**

`server/routes/health.ts`:

```ts
import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncRuns } from "../db/schema.ts";
import { getCookie } from "../db/settings.ts";

export const health = new Hono().get("/", async (c) => {
  const [cookie, last] = await Promise.all([
    getCookie(),
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1).get(),
  ]);
  return c.json({
    ok: true,
    cookie_ok: !!cookie,
    last_sync_at: last?.startedAt ?? null,
  });
});
```

- [ ] **Step 7: Run all api tests**

Run: `bun test tests/api/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes/bundles.ts server/routes/health.ts server/index.ts tests/api/bundles.test.ts
git commit -m "feat(api): bundles routes and richer health response"
```

---

## Phase 5 — Frontend

### Task 16: Typed API client + TanStack Query/Router setup

**Files:**
- Modify: `web/src/main.tsx`
- Create: `web/src/api/client.ts`
- Create: `web/src/api/types.ts`
- Create: `web/src/router.tsx`
- Create: `web/src/routes/__root.tsx`
- Create: `web/src/routes/Library.tsx` (placeholder)

- [ ] **Step 1: Define shared types**

`web/src/api/types.ts`:

```ts
export type ItemRow = {
  id: string;
  bundleId: string;
  name: string;
  machineName: string;
  platform: "steam" | "gog" | "origin" | "uplay" | "drm-free" | "other";
  status: "unclaimed" | "revealed" | "redeemed";
  keyValue: string | null;
  claimUrl: string | null;
  expiresAt: number | null;
  notes: string | null;
  tags: string | null;
  createdAt: number;
  updatedAt: number;
};

export type BundleRow = {
  id: string;
  name: string;
  source: "choice" | "bundle" | "store" | "other";
  purchasedAt: number | null;
  url: string | null;
  rawJson: string;
  createdAt: number;
  updatedAt: number;
};

export type SyncStatus = {
  running: boolean;
  last: {
    id: number;
    startedAt: number;
    finishedAt: number | null;
    status: "running" | "ok" | "error" | "partial";
    error: string | null;
  } | null;
};

export type Health = {
  ok: boolean;
  cookie_ok: boolean;
  last_sync_at: number | null;
};
```

- [ ] **Step 2: Implement client**

`web/src/api/client.ts`:

```ts
import type { Health, ItemRow, BundleRow, SyncStatus } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => get<Health>("/api/health"),
  items: (params: URLSearchParams = new URLSearchParams()) =>
    get<ItemRow[]>(`/api/items?${params.toString()}`),
  patchItem: (id: string, patch: Partial<Pick<ItemRow, "status" | "notes" | "tags">>) =>
    send<ItemRow>(`/api/items/${id}`, "PATCH", patch),
  bundles: () => get<BundleRow[]>("/api/bundles"),
  bundle: (id: string) => get<{ bundle: BundleRow; items: ItemRow[] }>(`/api/bundles/${id}`),
  syncStatus: () => get<SyncStatus>("/api/sync/status"),
  triggerSync: () => send<{ runId: number }>("/api/sync", "POST"),
  settings: () => get<{ hasCookie: boolean; syncIntervalHours: number }>("/api/settings"),
  setCookie: (cookie: string) => send<void>("/api/settings/cookie", "PUT", { cookie }),
};
```

- [ ] **Step 3: Set up router with placeholder routes**

`web/src/routes/__root.tsx`:

```tsx
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r p-4 space-y-2">
        <h1 className="font-semibold mb-4">Humble Tracker</h1>
        <nav className="flex flex-col gap-1 text-sm">
          <Link to="/library" className="hover:underline">Library</Link>
          <Link to="/bundles" className="hover:underline">Bundles</Link>
          <Link to="/expiring" className="hover:underline">Expiring</Link>
          <Link to="/unclaimed" className="hover:underline">Unclaimed</Link>
          <Link to="/settings" className="hover:underline mt-4">Settings</Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  ),
});
```

`web/src/routes/Library.tsx`:

```tsx
import { createRoute } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/library",
  component: () => <div>Library (TODO)</div>,
});
```

`web/src/router.tsx`:

```tsx
import { createRouter, createRoute, redirect } from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as LibraryRoute } from "./routes/Library";

const indexRedirect = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});

const routeTree = RootRoute.addChildren([LibraryRoute, indexRedirect]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 4: Wire main.tsx**

`web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Verify dev**

Run `bun run dev:server` in one shell, `bun run dev:web` in another, open `http://localhost:5174/library`. Confirm sidebar renders, "Library (TODO)" shows.

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat(web): typed api client, router, sidebar shell"
```

---

### Task 17: Settings page + first-launch redirect

**Files:**
- Create: `web/src/routes/Settings.tsx`
- Modify: `web/src/router.tsx`
- Modify: `web/src/routes/__root.tsx`

- [ ] **Step 1: Implement Settings.tsx**

`web/src/routes/Settings.tsx`:

```tsx
import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { Route as RootRoute } from "./__root";

function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const [cookie, setCookie] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (c: string) => api.setCookie(c),
    onSuccess: async () => {
      setCookie("");
      setFeedback("Saved. Testing...");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      const h = await api.health();
      setFeedback(h.cookie_ok ? "Cookie OK." : "Cookie saved but health check failed.");
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-semibold">Settings</h2>
      <section className="space-y-3">
        <h3 className="font-medium">Humble session cookie</h3>
        <p className="text-sm text-slate-600">
          On <a href="https://www.humblebundle.com" target="_blank" rel="noreferrer" className="underline">humblebundle.com</a>, open DevTools → Application → Cookies → copy the value of <code>_simpleauth_sess</code>.
        </p>
        <textarea
          className="w-full border rounded p-2 text-sm font-mono"
          rows={3}
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          placeholder={settings.data?.hasCookie ? "(stored — paste a new value to replace)" : "paste cookie value"}
        />
        <button
          className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-50"
          disabled={!cookie || save.isPending}
          onClick={() => save.mutate(cookie)}
        >
          {save.isPending ? "Saving..." : "Save & test"}
        </button>
        {feedback && <p className="text-sm">{feedback}</p>}
        <p className="text-sm">
          Status: cookie {health.data?.cookie_ok ? "✅ ok" : "❌ missing/expired"}
        </p>
      </section>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/settings",
  component: SettingsPage,
});
```

- [ ] **Step 2: Add first-launch redirect in __root.tsx**

Replace `web/src/routes/__root.tsx`:

```tsx
import { createRootRouteWithContext, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../api/client";

export const Route = createRootRouteWithContext()({
  component: Shell,
});

function Shell() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (
      settings.data &&
      !settings.data.hasCookie &&
      !location.pathname.startsWith("/settings")
    ) {
      navigate({ to: "/settings" });
    }
  }, [settings.data, location.pathname, navigate]);

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r p-4 space-y-2">
        <h1 className="font-semibold mb-4">Humble Tracker</h1>
        <nav className="flex flex-col gap-1 text-sm">
          <Link to="/library" className="[&.active]:font-semibold">Library</Link>
          <Link to="/bundles" className="[&.active]:font-semibold">Bundles</Link>
          <Link to="/expiring" className="[&.active]:font-semibold">Expiring</Link>
          <Link to="/unclaimed" className="[&.active]:font-semibold">Unclaimed</Link>
          <Link to="/settings" className="mt-4 [&.active]:font-semibold">Settings</Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        {settings.data && !settings.data.hasCookie && !location.pathname.startsWith("/settings") && (
          <div className="mb-4 p-3 border rounded bg-amber-50 text-amber-900 text-sm">
            No Humble cookie set. Configure it in Settings to start syncing.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Register route**

`web/src/router.tsx`:

```tsx
import { createRouter, createRoute, redirect } from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as LibraryRoute } from "./routes/Library";
import { Route as SettingsRoute } from "./routes/Settings";

const indexRedirect = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});

const routeTree = RootRoute.addChildren([LibraryRoute, SettingsRoute, indexRedirect]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 4: Manual smoke test**

Run dev, visit `/library` with no cookie set → should redirect to `/settings`. Paste a cookie, save → see "Cookie OK."

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/Settings.tsx web/src/routes/__root.tsx web/src/router.tsx
git commit -m "feat(web): settings page with cookie paste + first-launch redirect"
```

---

### Task 18: Library view (table, search, filters, row expand)

**Files:**
- Create: `web/src/components/ItemTable.tsx`
- Create: `web/src/components/StatusBadge.tsx`
- Modify: `web/src/routes/Library.tsx`

- [ ] **Step 1: Implement StatusBadge**

`web/src/components/StatusBadge.tsx`:

```tsx
import type { ItemRow } from "../api/types";

const COLORS: Record<ItemRow["status"], string> = {
  unclaimed: "bg-amber-100 text-amber-900",
  revealed: "bg-blue-100 text-blue-900",
  redeemed: "bg-emerald-100 text-emerald-900",
};

export function StatusBadge({ status }: { status: ItemRow["status"] }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${COLORS[status]}`}>{status}</span>
  );
}
```

- [ ] **Step 2: Implement ItemTable**

`web/src/components/ItemTable.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { ItemRow } from "../api/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  items: ItemRow[];
  selectable?: boolean;
  onSelectionChange?: (ids: Set<string>) => void;
  selected?: Set<string>;
};

function fmtDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

export function ItemTable({ items, selectable, selected, onSelectionChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    if (!selected || !onSelectionChange) return;
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  };

  return (
    <table className="w-full text-sm">
      <thead className="text-left border-b">
        <tr>
          {selectable && <th className="p-2 w-8"></th>}
          <th className="p-2">Name</th>
          <th className="p-2">Platform</th>
          <th className="p-2">Status</th>
          <th className="p-2">Bundle</th>
          <th className="p-2">Expires</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const isOpen = openId === it.id;
          return (
            <RowGroup
              key={it.id}
              item={it}
              isOpen={isOpen}
              onToggle={() => setOpenId(isOpen ? null : it.id)}
              selectable={!!selectable}
              checked={selected?.has(it.id) ?? false}
              onSelectChange={() => toggleSelect(it.id)}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function RowGroup({
  item,
  isOpen,
  onToggle,
  selectable,
  checked,
  onSelectChange,
}: {
  item: ItemRow;
  isOpen: boolean;
  onToggle: () => void;
  selectable: boolean;
  checked: boolean;
  onSelectChange: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(item.notes ?? "");

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof api.patchItem>[1]) => api.patchItem(item.id, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });

  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-slate-50" onClick={onToggle}>
        {selectable && (
          <td className="p-2" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={checked} onChange={onSelectChange} />
          </td>
        )}
        <td className="p-2">{item.name}</td>
        <td className="p-2">{item.platform}</td>
        <td className="p-2"><StatusBadge status={item.status} /></td>
        <td className="p-2 text-slate-500">{item.bundleId}</td>
        <td className="p-2">{fmtDate(item.expiresAt)}</td>
        <td className="p-2">
          {item.claimUrl && (
            <a
              href={item.claimUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline"
            >
              open
            </a>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-slate-50">
          <td colSpan={selectable ? 7 : 6} className="p-3 space-y-3">
            {item.keyValue && (
              <div className="font-mono text-xs">key: {item.keyValue}</div>
            )}
            <textarea
              className="w-full border rounded p-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (item.notes ?? "")) patch.mutate({ notes });
              }}
              placeholder="notes…"
            />
            <div className="flex gap-2">
              {item.status !== "redeemed" && (
                <button
                  className="px-2 py-1 text-xs border rounded"
                  onClick={() => patch.mutate({ status: "redeemed" })}
                >
                  Mark redeemed
                </button>
              )}
              {item.status === "redeemed" && (
                <button
                  className="px-2 py-1 text-xs border rounded"
                  onClick={() => patch.mutate({ status: "revealed" })}
                >
                  Unmark redeemed
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 3: Library route**

`web/src/routes/Library.tsx`:

```tsx
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api } from "../api/client";
import type { ItemRow } from "../api/types";
import { ItemTable } from "../components/ItemTable";
import { Route as RootRoute } from "./__root";

function Library() {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (platform) p.set("platform", platform);
    if (status) p.set("status", status);
    return p;
  }, [q, platform, status]);

  const { data } = useQuery({
    queryKey: ["items", params.toString()],
    queryFn: () => api.items(params),
  });

  const items: ItemRow[] = data ?? [];

  const openSelected = async () => {
    const urls = items.filter((i) => selected.has(i.id)).map((i) => i.claimUrl).filter(Boolean) as string[];
    if (urls.length === 0) return;
    if (!confirm(`Open ${urls.length} tabs? Allow popups for this site if prompted.`)) return;
    for (const url of urls) {
      window.open(url, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Library</h2>
      <div className="flex gap-2">
        <input
          autoFocus
          className="border rounded px-2 py-1 flex-1"
          placeholder="search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="border rounded px-2" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">all platforms</option>
          {["steam", "gog", "origin", "uplay", "drm-free", "other"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="border rounded px-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">all statuses</option>
          {["unclaimed", "revealed", "redeemed", "expired"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {selected.size > 0 && (
        <div className="sticky top-0 bg-white border rounded p-2 flex justify-between items-center">
          <span className="text-sm">{selected.size} selected</span>
          <div className="flex gap-2">
            <button className="text-sm underline" onClick={() => setSelected(new Set())}>clear</button>
            <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm" onClick={openSelected}>
              Open {selected.size} claim pages
            </button>
          </div>
        </div>
      )}
      <ItemTable items={items} selectable selected={selected} onSelectionChange={setSelected} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/library",
  component: Library,
});
```

- [ ] **Step 4: Manual smoke test**

With a cookie set and a sync run completed, navigate to `/library`. Type a search query — table should narrow. Select a few rows, click "Open N claim pages" — confirm dialog appears, then tabs open.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ web/src/routes/Library.tsx
git commit -m "feat(web): library view with search, filters, multi-select bulk-open"
```

---

### Task 19: Bundles view

**Files:**
- Create: `web/src/routes/Bundles.tsx`
- Create: `web/src/routes/BundleDetail.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Bundles list**

`web/src/routes/Bundles.tsx`:

```tsx
import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../api/client";
import type { BundleRow } from "../api/types";
import { Route as RootRoute } from "./__root";

function groupByYearMonth(bundles: BundleRow[]): Map<string, BundleRow[]> {
  const m = new Map<string, BundleRow[]>();
  for (const b of bundles) {
    const key = b.purchasedAt
      ? new Date(b.purchasedAt).toISOString().slice(0, 7)
      : "unknown";
    const arr = m.get(key) ?? [];
    arr.push(b);
    m.set(key, arr);
  }
  return m;
}

function Bundles() {
  const { data } = useQuery({ queryKey: ["bundles"], queryFn: api.bundles });
  const bundles = data ?? [];
  const choice = bundles.filter((b) => b.source === "choice");
  const others = bundles.filter((b) => b.source !== "choice");
  const grouped = useMemo(() => groupByYearMonth(choice), [choice]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Bundles</h2>
      <section>
        <h3 className="font-medium mb-2">Humble Choice</h3>
        <ul className="space-y-1">
          {Array.from(grouped.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([month, bs]) => (
            <li key={month}>
              <div className="text-sm text-slate-500">{month}</div>
              <ul className="ml-4">
                {bs.map((b) => (
                  <li key={b.id}>
                    <Link to="/bundles/$id" params={{ id: b.id }} className="hover:underline">
                      {b.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-medium mb-2">Other</h3>
        <ul className="space-y-1">
          {others.map((b) => (
            <li key={b.id}>
              <Link to="/bundles/$id" params={{ id: b.id }} className="hover:underline">
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/bundles",
  component: Bundles,
});
```

- [ ] **Step 2: Bundle detail**

`web/src/routes/BundleDetail.tsx`:

```tsx
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { ItemTable } from "../components/ItemTable";
import { Route as RootRoute } from "./__root";

function BundleDetail() {
  const { id } = Route.useParams();
  const { data } = useQuery({ queryKey: ["bundle", id], queryFn: () => api.bundle(id) });
  if (!data) return <div>Loading…</div>;

  const unclaimedUrls = data.items
    .filter((i) => i.status === "unclaimed" && i.claimUrl)
    .map((i) => i.claimUrl!) as string[];

  const openAll = async () => {
    if (!confirm(`Open ${unclaimedUrls.length} tabs?`)) return;
    for (const u of unclaimedUrls) {
      window.open(u, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">{data.bundle.name}</h2>
      {unclaimedUrls.length > 0 && (
        <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm" onClick={openAll}>
          Open {unclaimedUrls.length} unclaimed
        </button>
      )}
      <ItemTable items={data.items} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/bundles/$id",
  component: BundleDetail,
});
```

- [ ] **Step 3: Register routes**

`web/src/router.tsx`:

```tsx
import { createRouter, createRoute, redirect } from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as LibraryRoute } from "./routes/Library";
import { Route as SettingsRoute } from "./routes/Settings";
import { Route as BundlesRoute } from "./routes/Bundles";
import { Route as BundleDetailRoute } from "./routes/BundleDetail";

const indexRedirect = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});

const routeTree = RootRoute.addChildren([
  LibraryRoute,
  SettingsRoute,
  BundlesRoute,
  BundleDetailRoute,
  indexRedirect,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 4: Manual smoke test**

Visit `/bundles`. Confirm Choice months are grouped, click into a bundle, see its items and the "Open N unclaimed" button.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/Bundles.tsx web/src/routes/BundleDetail.tsx web/src/router.tsx
git commit -m "feat(web): bundles list + bundle detail view"
```

---

### Task 20: Expiring view

**Files:**
- Create: `web/src/routes/Expiring.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Implement Expiring**

`web/src/routes/Expiring.tsx`:

```tsx
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ItemRow } from "../api/types";
import { Route as RootRoute } from "./__root";
import { StatusBadge } from "../components/StatusBadge";

function urgencyColor(ms: number | null): string {
  if (!ms) return "";
  const days = (ms - Date.now()) / 86_400_000;
  if (days < 7) return "bg-red-50";
  if (days < 30) return "bg-amber-50";
  return "";
}

function Expiring() {
  const { data } = useQuery({
    queryKey: ["items", "expiring"],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("expiringWithin", "365");
      p.set("sort", "expiresAt");
      return api.items(p);
    },
  });

  const items: ItemRow[] = (data ?? [])
    .filter((i) => i.status !== "redeemed" && i.expiresAt !== null)
    .sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0));

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Expiring soon</h2>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className={`flex justify-between p-2 rounded ${urgencyColor(i.expiresAt)}`}>
            <span>{i.name}</span>
            <span className="text-sm flex gap-3 items-center">
              <StatusBadge status={i.status} />
              <span className="text-slate-600">{i.expiresAt ? new Date(i.expiresAt).toLocaleDateString() : ""}</span>
              {i.claimUrl && <a href={i.claimUrl} target="_blank" rel="noreferrer" className="underline">open</a>}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="text-slate-500 text-sm">Nothing expiring.</li>}
      </ul>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/expiring",
  component: Expiring,
});
```

- [ ] **Step 2: Register route**

Add `ExpiringRoute` to `routeTree` in `web/src/router.tsx` (alongside the others).

- [ ] **Step 3: Smoke test**

Visit `/expiring`. Confirm urgency colors, items sorted soonest-first, redeemed items excluded.

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/Expiring.tsx web/src/router.tsx
git commit -m "feat(web): expiring view"
```

---

### Task 21: Unclaimed view

**Files:**
- Create: `web/src/routes/Unclaimed.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Implement**

`web/src/routes/Unclaimed.tsx`:

```tsx
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { ItemTable } from "../components/ItemTable";
import { Route as RootRoute } from "./__root";

function Unclaimed() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data } = useQuery({
    queryKey: ["items", "unclaimed"],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("status", "unclaimed");
      return api.items(p);
    },
  });
  const items = data ?? [];

  const openSelected = async () => {
    const urls = items.filter((i) => selected.has(i.id)).map((i) => i.claimUrl).filter(Boolean) as string[];
    if (!urls.length) return;
    if (!confirm(`Open ${urls.length} tabs?`)) return;
    for (const u of urls) {
      window.open(u, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Unclaimed</h2>
      {selected.size > 0 && (
        <div className="sticky top-0 bg-white border rounded p-2 flex justify-between items-center">
          <span className="text-sm">{selected.size} selected</span>
          <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm" onClick={openSelected}>
            Open {selected.size}
          </button>
        </div>
      )}
      <ItemTable items={items} selectable selected={selected} onSelectionChange={setSelected} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/unclaimed",
  component: Unclaimed,
});
```

- [ ] **Step 2: Register route**

Add to `web/src/router.tsx` `routeTree`.

- [ ] **Step 3: Smoke test**

Visit `/unclaimed`. Confirm only `status=unclaimed` items, multi-select + bulk-open works.

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/Unclaimed.tsx web/src/router.tsx
git commit -m "feat(web): unclaimed view"
```

---

### Task 22: Sync indicator + refresh button in shell

**Files:**
- Create: `web/src/components/SyncIndicator.tsx`
- Modify: `web/src/routes/__root.tsx`

- [ ] **Step 1: Implement**

`web/src/components/SyncIndicator.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function SyncIndicator() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: api.syncStatus,
    refetchInterval: (query) => (query.state.data?.running ? 1500 : 30_000),
  });

  const trigger = useMutation({
    mutationFn: api.triggerSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-status"] }),
  });

  const last = status.data?.last;
  const running = status.data?.running ?? false;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-600">
        {running
          ? "syncing…"
          : last?.startedAt
          ? `last sync: ${new Date(last.startedAt).toLocaleString()}`
          : "no sync yet"}
      </span>
      <button
        className="px-2 py-1 border rounded disabled:opacity-50"
        disabled={running || trigger.isPending}
        onClick={() => trigger.mutate()}
      >
        Refresh
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount in __root.tsx**

In `web/src/routes/__root.tsx`, add to the `<main>` top:

```tsx
import { SyncIndicator } from "../components/SyncIndicator";
// ...
<main className="flex-1 p-6">
  <div className="flex justify-end mb-4"><SyncIndicator /></div>
  {/* existing banner + Outlet */}
```

- [ ] **Step 3: Smoke test**

Click Refresh — indicator goes "syncing…" then back to a fresh timestamp. Items page should show new data after `staleTime` expires (or trigger a manual refetch).

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SyncIndicator.tsx web/src/routes/__root.tsx
git commit -m "feat(web): sync indicator + refresh button"
```

---

## Phase 6 — End-to-end and polish

### Task 23: Full app smoke + README polish

- [ ] **Step 1: Run all server tests**

Run: `bun test`
Expected: PASS — every test green.

- [ ] **Step 2: Build production bundle and run from a single port**

```bash
cd web && bun run build && cd ..
PORT=5173 bun run start
```

Open `http://localhost:5173`. Confirm:
- First visit redirects to `/settings` if no cookie.
- After paste + save, refresh kicks a sync, indicator updates, library shows items.
- Search narrows results.
- Bundle detail shows items, "Open N unclaimed" works.
- Expiring view colors match urgency.

- [ ] **Step 3: Polish README with the actual run instructions**

Replace the "Run" section of `README.md`:

```md
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

## Cookie

In a browser logged into humblebundle.com:

1. Open DevTools → Application → Cookies → `https://www.humblebundle.com`
2. Copy the **value** of `_simpleauth_sess`
3. Paste it into the app's Settings page

The cookie lasts months in practice. When it expires, you'll see a banner —
re-paste a fresh value.
```

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: real run instructions and cookie how-to"
git push
```

---

## Self-review checks

(For the implementer to run after the plan is complete.)

- All four views (`/library`, `/bundles`, `/expiring`, `/unclaimed`) reachable from sidebar — ✓ via Tasks 18, 19, 20, 21.
- Search across the whole library — ✓ Task 14 (FTS) + Task 18 (UI).
- Filters by platform and status — ✓ Task 14 + 18.
- Bulk-select + open-all — ✓ Task 18 (Library) and 21 (Unclaimed); Task 19 (Bundle detail open-all-unclaimed).
- Sync on launch + on demand — ✓ Task 13 (scheduler + manual route) + Task 22 (button).
- Cookie storage + first-launch UX — ✓ Task 7 (storage) + Task 17 (UI + redirect).
- Idempotent sync, preserves notes/tags — ✓ Task 11 (`upsertParsed`).
- Per-order failures don't kill sync — ✓ Task 11 (try/catch + `partial` status).
- Manual `redeemed` toggle — ✓ Task 14 (PATCH) + Task 18 (UI button).
- PlaywrightFetcher stub behind interface — ✓ Task 8 + Task 12 factory.
- No tags-editing UI for v1 — ✓ Task 18 only edits `notes`.
- Single-port production deploy via `bun run start` — ✓ Task 4 + Task 23.

## Out of scope (will not be implemented in this plan)

- Notifications, email, push.
- Auto-claim.
- Multi-user / auth.
- Mobile-polished UI.
- PlaywrightFetcher implementation (stub only).
- Docker Compose.
- Triage integration.
- `tags` editing UI (column exists in DB; defer to v2).
