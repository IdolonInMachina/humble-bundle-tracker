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

class FailingFetcher implements Fetcher {
  async sync(): Promise<SyncReport> {
    throw new Error("boom");
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

  test("writes error row when fetcher throws", async () => {
    const runner = new SyncRunner(new FailingFetcher());
    await runner.kick();
    await runner.waitForIdle();
    const rows = await db.select().from(syncRuns).all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("error");
    expect(rows[0]!.error).toBe("boom");
    expect(rows[0]!.finishedAt).not.toBeNull();
  });
});
