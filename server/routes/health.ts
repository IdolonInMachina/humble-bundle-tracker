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
