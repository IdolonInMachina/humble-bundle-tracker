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
    runner.kick();
    return;
  }
  const intervalMs = (await getSyncIntervalHours()) * 60 * 60 * 1000;
  if (Date.now() - last.startedAt > intervalMs) runner.kick();
}
