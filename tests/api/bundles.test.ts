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
