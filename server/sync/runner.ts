import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncRuns } from "../db/schema.ts";
import type { Fetcher, SyncReport } from "../fetcher/types.ts";

export class SyncRunner {
  // Single-flight guard: while a run is in progress, every caller of `kick()`
  // gets back this exact Promise instance (the test asserts a === b).
  private inFlight: Promise<{ runId: number }> | null = null;

  constructor(private fetcher: Fetcher) {}

  kick(): Promise<{ runId: number }> {
    if (this.inFlight) return this.inFlight;
    // Hand out the post-finally promise so callers see the same identity
    // even if a second kick arrives while we're settling. The .finally
    // callback clears inFlight as a microtask after the promise settles.
    const p = this.run();
    this.inFlight = p.finally(() => {
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
      await db
        .update(syncRuns)
        .set({
          finishedAt: Date.now(),
          status: "error",
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
