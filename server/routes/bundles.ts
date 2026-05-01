import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.ts";
import { bundles, items } from "../db/schema.ts";

export const bundlesRoutes = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(bundles)
      .orderBy(desc(bundles.purchasedAt))
      .all();
    return c.json(rows);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const bundle = await db.select().from(bundles).where(eq(bundles.id, id)).get();
    if (!bundle) return c.json({ error: "not found" }, 404);
    const bundleItems = await db.select().from(items).where(eq(items.bundleId, id)).all();
    return c.json({ bundle, items: bundleItems });
  });
