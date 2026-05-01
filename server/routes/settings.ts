import { Hono } from "hono";
import { getCookie, setCookie, getSyncIntervalHours, setSetting } from "../db/settings.ts";

export const settingsRoutes = new Hono()
  .get("/", async (c) => {
    const [cookie, syncIntervalHours] = await Promise.all([
      getCookie(),
      getSyncIntervalHours(),
    ]);
    return c.json({
      hasCookie: cookie !== null && cookie.length > 0,
      syncIntervalHours,
    });
  })
  .put("/cookie", async (c) => {
    const body = (await c.req.json()) as { cookie?: unknown };
    if (typeof body.cookie !== "string" || body.cookie.length === 0) {
      return c.json({ error: "cookie must be a non-empty string" }, 400);
    }
    await setCookie(body.cookie);
    return c.body(null, 204);
  })
  .put("/", async (c) => {
    const body = (await c.req.json()) as { syncIntervalHours?: unknown };
    if (typeof body.syncIntervalHours === "number" && body.syncIntervalHours > 0) {
      await setSetting("sync_interval_hours", String(body.syncIntervalHours));
    }
    return c.body(null, 204);
  });
