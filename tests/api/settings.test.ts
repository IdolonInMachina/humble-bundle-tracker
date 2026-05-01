import { describe, expect, test, beforeEach } from "bun:test";
import { app } from "../../server/index.ts";
import { sqlite } from "../../server/db/client.ts";

describe("settings routes", () => {
  beforeEach(() => {
    sqlite.exec("DELETE FROM settings");
  });

  test("GET /api/settings returns hasCookie=false initially", async () => {
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasCookie).toBe(false);
    expect(body.syncIntervalHours).toBe(6);
  });

  test("PUT /api/settings/cookie stores it; subsequent GET reports hasCookie=true", async () => {
    const put = await app.request("/api/settings/cookie", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cookie: "abc123" }),
    });
    expect(put.status).toBe(204);

    const res = await app.request("/api/settings");
    const body = await res.json();
    expect(body.hasCookie).toBe(true);
  });

  test("PUT /api/settings rejects non-positive interval with 400", async () => {
    for (const bad of [0, -1, "6", null, undefined]) {
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syncIntervalHours: bad }),
      });
      expect(res.status).toBe(400);
    }
  });

  test("PUT /api/settings persists positive interval and reflects in GET", async () => {
    const put = await app.request("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ syncIntervalHours: 12 }),
    });
    expect(put.status).toBe(204);
    const res = await app.request("/api/settings");
    const body = await res.json();
    expect(body.syncIntervalHours).toBe(12);
  });
});
