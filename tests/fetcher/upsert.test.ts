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
