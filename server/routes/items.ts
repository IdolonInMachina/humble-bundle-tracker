import { Hono } from "hono";
import { and, eq, inArray, isNotNull, lte, asc } from "drizzle-orm";
import { db, sqlite } from "../db/client.ts";
import { items } from "../db/schema.ts";
import { searchItems } from "../db/fts.ts";

const PLATFORMS = ["steam", "gog", "origin", "uplay", "drm-free", "other"] as const;
const STATUSES = ["unclaimed", "revealed", "redeemed", "expired"] as const;

export const itemsRoutes = new Hono()
  .get("/", async (c) => {
    const q = c.req.query("q");
    const platform = c.req.query("platform");
    const status = c.req.query("status");
    const expiringWithin = c.req.query("expiringWithin");
    const bundleId = c.req.query("bundleId");
    const sort = c.req.query("sort") ?? "name";

    const conds = [];
    if (platform && (PLATFORMS as readonly string[]).includes(platform)) {
      conds.push(eq(items.platform, platform as (typeof PLATFORMS)[number]));
    }
    if (status === "expired") {
      conds.push(and(isNotNull(items.expiresAt), lte(items.expiresAt, Date.now()))!);
    } else if (status && (STATUSES as readonly string[]).includes(status)) {
      conds.push(eq(items.status, status as Exclude<(typeof STATUSES)[number], "expired">));
    }
    if (expiringWithin) {
      const ms = Number(expiringWithin) * 86_400_000;
      conds.push(and(isNotNull(items.expiresAt), lte(items.expiresAt, Date.now() + ms))!);
    }
    if (bundleId) conds.push(eq(items.bundleId, bundleId));

    if (q) {
      const ids = searchItems(sqlite, q);
      if (!ids.length) return c.json([]);
      conds.push(inArray(items.id, ids));
    }

    const orderCol =
      sort === "expiresAt" ? items.expiresAt : sort === "bundleDate" ? items.createdAt : items.name;
    const rows = await db
      .select()
      .from(items)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(orderCol))
      .all();
    return c.json(rows);
  })
  .get("/:id", async (c) => {
    const row = await db.select().from(items).where(eq(items.id, c.req.param("id"))).get();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as {
      status?: string;
      notes?: string;
      tags?: string;
    };
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (body.status && (["unclaimed", "revealed", "redeemed"] as const).includes(body.status as never)) {
      patch.status = body.status;
    }
    if (typeof body.notes === "string") patch.notes = body.notes;
    if (typeof body.tags === "string") patch.tags = body.tags;
    await db.update(items).set(patch).where(eq(items.id, id));
    const row = await db.select().from(items).where(eq(items.id, id)).get();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });
