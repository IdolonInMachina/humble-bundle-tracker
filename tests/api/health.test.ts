import { describe, expect, test } from "bun:test";
import { app } from "../../server/index.ts";

describe("GET /api/health", () => {
  test("returns ok=true and a last_sync_at field", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("last_sync_at");
    expect(body).toHaveProperty("cookie_ok");
  });
});
