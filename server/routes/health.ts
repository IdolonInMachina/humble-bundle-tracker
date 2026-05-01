import { Hono } from "hono";

export const health = new Hono().get("/", (c) =>
  c.json({ ok: true, last_sync_at: null, cookie_ok: false })
);
