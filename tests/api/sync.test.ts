import { describe, expect, test } from "bun:test";
import { app } from "../../server/index.ts";

describe("sync routes", () => {
  test("GET /api/sync/status returns running=false initially", async () => {
    const res = await app.request("/api/sync/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.running).toBe(false);
  });

  test("GET /api/sync/runs returns an array", async () => {
    const res = await app.request("/api/sync/runs");
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
