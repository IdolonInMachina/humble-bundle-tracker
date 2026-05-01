import type { Fetcher, SyncOpts, SyncReport } from "./types.ts";
import { CookieExpiredError } from "./types.ts";
import { parseOrder } from "./parse.ts";
import { upsertParsed } from "./upsert.ts";
import { extractChoiceMenu, type ChoiceMenu } from "./extract-choice-menu.ts";
import { getCookie } from "../db/settings.ts";

const BASE = "https://www.humblebundle.com";
const CONCURRENCY = 5;

async function pmap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// Humble's subscriptions endpoint returns { cursor, products: [...] } rather
// than a bare array, so we extract gamekeys defensively across both shapes.
function extractGamekeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((o) =>
        typeof o === "object" && o !== null ? (o as { gamekey?: unknown }).gamekey : null,
      )
      .filter((k): k is string => typeof k === "string");
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as { products?: unknown; gamekeys?: unknown };
    if (Array.isArray(obj.products)) return extractGamekeys(obj.products);
    if (Array.isArray(obj.gamekeys))
      return obj.gamekeys.filter((k): k is string => typeof k === "string");
  }
  return [];
}

export class CookieFetcher implements Fetcher {
  async sync(_opts: SyncOpts): Promise<SyncReport> {
    const startedAt = Date.now();
    const cookie = await getCookie();
    if (!cookie) throw new CookieExpiredError();

    const headers: HeadersInit = {
      Cookie: `_simpleauth_sess=${cookie}`,
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    };

    const fetchJson = async (path: string): Promise<unknown> => {
      const res = await fetch(`${BASE}${path}`, { headers });
      if (res.status === 401 || res.status === 302) throw new CookieExpiredError();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) throw new CookieExpiredError();
      return res.json();
    };

    // The Choice menu lives in the /membership/<slug> HTML page rather than
    // any JSON API. We deliberately don't surface this as a hard error: the
    // user's email is embedded in the HTML, and a soft fall-back to the
    // existing extras-only behaviour is preferable to failing the order.
    const fetchHtml = async (path: string): Promise<string | null> => {
      try {
        const res = await fetch(`${BASE}${path}`, {
          headers: { ...headers, Accept: "text/html" },
        });
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("html")) return null;
        return await res.text();
      } catch {
        return null;
      }
    };

    // List all order gamekeys (also serves as the cookie health check —
    // 401/non-JSON throws CookieExpiredError).
    const orders = await fetchJson("/api/v1/user/order");
    // Plus monthly subscription products.
    const subs = await fetchJson(
      "/api/v1/subscriptions/humble_monthly/subscription_products_with_gamekeys",
    );
    const allKeys = Array.from(
      new Set([...extractGamekeys(orders), ...extractGamekeys(subs)]),
    );

    // 4. fetch + parse each, tolerating per-order failures.
    // The order-detail endpoint is singular `/order/`, not plural — the plural
    // form 404s for every key.
    let partial = false;
    const errors: string[] = [];
    const parsed = await pmap(allKeys, CONCURRENCY, async (key) => {
      try {
        const detail = await fetchJson(`/api/v1/order/${key}?all_tpkds=true`);
        const detailObj = detail as {
          product?: { category?: string; choice_url?: string };
        };
        // Choice months expose a slug (`choice_url`) plus the
        // `subscriptioncontent` category. Extras-only behaviour is the
        // fall-back if either piece is missing or the scrape fails.
        let menu: ChoiceMenu | null = null;
        const category = detailObj.product?.category;
        const slug = detailObj.product?.choice_url;
        if (category === "subscriptioncontent" && typeof slug === "string" && slug) {
          const html = await fetchHtml(`/membership/${slug}`);
          if (html) menu = extractChoiceMenu(html);
        }
        return parseOrder(
          detail as Parameters<typeof parseOrder>[0],
          menu ?? undefined,
        );
      } catch (e) {
        partial = true;
        errors.push(`${key}: ${(e as Error).message}`);
        return null;
      }
    });

    const valid = parsed.filter((p): p is NonNullable<typeof p> => p !== null);
    const counts = await upsertParsed(valid);

    // Distinguish total-failure from partial-success: if every key errored
    // we want "error", not "partial".
    let status: SyncReport["status"];
    if (allKeys.length === 0) {
      status = "ok"; // nothing to fetch is success, not error
    } else if (errors.length === allKeys.length) {
      status = "error"; // every order failed
    } else if (partial) {
      status = "partial"; // some succeeded, some failed
    } else {
      status = "ok"; // all succeeded
    }

    return {
      startedAt,
      finishedAt: Date.now(),
      status,
      bundlesSeen: counts.bundlesSeen,
      itemsAdded: counts.itemsAdded,
      itemsUpdated: counts.itemsUpdated,
      error: errors.length ? formatErrors(errors) : null,
    };
  }
}

function formatErrors(errors: string[]): string {
  const MAX = 20;
  if (errors.length <= MAX) return errors.join("; ");
  return `${errors.slice(0, MAX).join("; ")}; ...and ${errors.length - MAX} more`;
}
