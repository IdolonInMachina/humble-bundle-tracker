import { eq } from "drizzle-orm";
import { db } from "./client.ts";
import { settings } from "./schema.ts";

const KEYS = {
  cookie: "humble_cookie",
  intervalHours: "sync_interval_hours",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const now = Date.now();
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    });
}

export const getCookie = () => getSetting(KEYS.cookie);
export const setCookie = (v: string) => setSetting(KEYS.cookie, v);

export async function getSyncIntervalHours(): Promise<number> {
  const v = await getSetting(KEYS.intervalHours);
  return v ? Number(v) : 6;
}
