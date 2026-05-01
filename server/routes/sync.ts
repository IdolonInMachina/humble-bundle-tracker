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
