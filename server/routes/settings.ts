import { Hono } from "hono";
import {
  getCookie,
  setCookie,
  getSyncIntervalHours,
  setSyncIntervalHours,
} from "../db/settings.ts";

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
    const v = body.syncIntervalHours;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return c.json({ error: "syncIntervalHours must be a positive number" }, 400);
    }
    await setSyncIntervalHours(v);
    return c.body(null, 204);
  });
