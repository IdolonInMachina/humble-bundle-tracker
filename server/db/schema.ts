import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const bundles = sqliteTable(
  "bundles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    source: text("source", { enum: ["choice", "bundle", "store", "other"] }).notNull(),
    purchasedAt: integer("purchased_at"),
    url: text("url"),
    rawJson: text("raw_json").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("bundles_purchased_at_idx").on(t.purchasedAt)],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    bundleId: text("bundle_id")
      .notNull()
      .references(() => bundles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    machineName: text("machine_name").notNull(),
    platform: text("platform", {
      enum: ["steam", "gog", "origin", "uplay", "drm-free", "other"],
    }).notNull(),
    status: text("status", { enum: ["unclaimed", "revealed", "redeemed"] }).notNull(),
    keyValue: text("key_value"),
    claimUrl: text("claim_url"),
    expiresAt: integer("expires_at"),
    notes: text("notes"),
    tags: text("tags"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("items_bundle_id_idx").on(t.bundleId),
    index("items_status_idx").on(t.status),
    index("items_expires_at_idx").on(t.expiresAt),
  ],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  status: text("status", { enum: ["running", "ok", "error", "partial"] }).notNull(),
  bundlesSeen: integer("bundles_seen").notNull().default(0),
  itemsAdded: integer("items_added").notNull().default(0),
  itemsUpdated: integer("items_updated").notNull().default(0),
  error: text("error"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
