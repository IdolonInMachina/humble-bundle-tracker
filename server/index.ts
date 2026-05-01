import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { health } from "./routes/health.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { itemsRoutes } from "./routes/items.ts";
import { bundlesRoutes } from "./routes/bundles.ts";
import { syncRoutes } from "./routes/sync.ts";
import { makeFetcher } from "./fetcher/factory.ts";
import { initSharedRunner } from "./sync/runner.ts";
import { maybeKickStaleSync } from "./sync/scheduler.ts";

const runner = initSharedRunner(makeFetcher());

const api = new Hono()
  .route("/health", health)
  .route("/settings", settingsRoutes)
  .route("/items", itemsRoutes)
  .route("/bundles", bundlesRoutes)
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
  // Default Bun idle timeout (10s) hangs up long syncs that take 20-30s+
  // against Humble's API. 60s is generous but safe.
  Bun.serve({ port, fetch: app.fetch, idleTimeout: 60 });
  console.log(`server listening on http://localhost:${port}`);
  maybeKickStaleSync(runner).catch((e) => console.error("startup sync failed", e));
}
