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
