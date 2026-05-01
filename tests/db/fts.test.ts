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
