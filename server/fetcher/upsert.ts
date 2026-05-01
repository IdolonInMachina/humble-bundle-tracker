import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { bundles, items } from "../db/schema.ts";
import type { ParseResult } from "./parse.ts";

export type UpsertCounts = {
  bundlesSeen: number;
  itemsAdded: number;
  itemsUpdated: number;
};

export async function upsertParsed(results: ParseResult[]): Promise<UpsertCounts> {
  const now = Date.now();
  let added = 0;
  let updated = 0;

  for (const { bundle, items: parsedItems } of results) {
    await db
      .insert(bundles)
      .values({ ...bundle, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: bundles.id,
        set: {
          name: bundle.name,
          source: bundle.source,
          purchasedAt: bundle.purchasedAt,
          url: bundle.url,
          rawJson: bundle.rawJson,
          updatedAt: now,
        },
      });

    for (const it of parsedItems) {
      // Detect insert vs update by checking existence first. We can't rely on
      // a CASE-on-createdAt trick because `now` may equal the prior row's
      // createdAt when two upserts run in the same millisecond.
      const existing = await db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.id, it.id))
        .get();

      await db
        .insert(items)
        .values({ ...it, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: items.id,
          set: {
            // Refresh fields that come from Humble; do NOT touch notes/tags.
            name: it.name,
            machineName: it.machineName,
            platform: it.platform,
            status: sql`CASE WHEN ${items.status} = 'redeemed' THEN ${items.status} ELSE ${it.status} END`,
            keyValue: it.keyValue,
            claimUrl: it.claimUrl,
            expiresAt: it.expiresAt,
            updatedAt: now,
          },
        });

      if (existing) updated++;
      else added++;
    }
  }

  return { bundlesSeen: results.length, itemsAdded: added, itemsUpdated: updated };
}
