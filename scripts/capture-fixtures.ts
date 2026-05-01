import { writeFile, mkdir } from "node:fs/promises";

const cookie = process.env.HUMBLE_COOKIE;
if (!cookie) {
  console.error("Set HUMBLE_COOKIE env var to your _simpleauth_sess value");
  process.exit(1);
}

const headers = {
  Cookie: `_simpleauth_sess=${cookie}`,
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json",
};

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function tryGet(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function probeEndpointVariants(key: string): Promise<string | null> {
  // Order matters: prefer variants likely to include tpkd_dict (with key data).
  const candidates = [
    `https://www.humblebundle.com/api/v1/order/${key}?all_tpkds=true`,
    `https://www.humblebundle.com/api/v1/orders/${key}?all_tpkds=true`,
    `https://www.humblebundle.com/api/v1/order/${key}`,
    `https://www.humblebundle.com/api/v1/orders/${key}`,
    `https://www.humblebundle.com/order/${key}.json`,
    `https://www.humblebundle.com/api/v1/orders?gamekeys=${key}`,
    `https://www.humblebundle.com/api/v1/orders/?gamekeys=${key}&all_tpkds=true`,
  ];
  console.log(`\nProbing endpoint shapes for key ${key}:`);
  let winner: string | null = null;
  for (const url of candidates) {
    const res = await fetch(url, { headers });
    const ct = res.headers.get("content-type") ?? "";
    const note = ct.includes("json") ? "json" : ct.split(";")[0] ?? "?";
    console.log(`  ${res.status} ${note.padEnd(20)} ${url.replace(`/${key}`, "/<key>").replace(`gamekeys=${key}`, "gamekeys=<key>")}`);
    if (res.ok && ct.includes("json") && winner === null) winner = url.replace(key, "{KEY}");
  }
  return winner;
}

function sanitize(data: unknown): unknown {
  return JSON.parse(
    JSON.stringify(data).replace(
      /("redeemed_key_val":\s*")[^"]+(")/g,
      '$1REDACTED$2'
    ).replace(
      /("[a-z_]*email[a-z_]*":\s*")[^"]+(")/gi,
      '$1redacted@example.com$2'
    )
  );
}

await mkdir("tests/fetcher/fixtures", { recursive: true });

const orders = await get("https://www.humblebundle.com/api/v1/user/order");
await writeFile(
  "tests/fetcher/fixtures/orders-list.json",
  JSON.stringify(sanitize(orders), null, 2)
);
console.log(`captured ${(orders as unknown[]).length} order keys`);

const subs = await get(
  "https://www.humblebundle.com/api/v1/subscriptions/humble_monthly/subscription_products_with_gamekeys"
);
await writeFile(
  "tests/fetcher/fixtures/subscriptions-list.json",
  JSON.stringify(sanitize(subs), null, 2)
);

// Walk gamekeys until we find ones that return 200. Some keys 404 (migrated /
// deleted orders, sub-only keys hitting the wrong endpoint, etc.). We want a
// few diverse fixtures so the parser sees both Choice months and bundle/store
// orders if present.
function extractKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((o) => (typeof o === "object" && o !== null ? (o as { gamekey?: unknown }).gamekey : null))
      .filter((k): k is string => typeof k === "string");
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as { products?: unknown; gamekeys?: unknown };
    if (Array.isArray(obj.products)) return extractKeys(obj.products);
    if (Array.isArray(obj.gamekeys)) return obj.gamekeys.filter((k): k is string => typeof k === "string");
  }
  return [];
}

const orderKeys = extractKeys(orders);
const subKeys = extractKeys(subs);
// Prioritize subs first — those are the most-recent Humble Choice months,
// which guarantees we capture current-shape data. The orders list comes
// after to backfill diverse types (bundles, storefront, older Choice).
const allKeys = Array.from(new Set([...subKeys, ...orderKeys]));
console.log(`considering ${subKeys.length} sub + ${orderKeys.length} order keys (${allKeys.length} unique, subs first)`);

if (allKeys.length === 0) {
  console.error("no gamekeys found, aborting");
  process.exit(1);
}

// Probe endpoint variants on the first key to find the right shape.
const probeKey = allKeys[0]!;
const winningUrlTemplate = await probeEndpointVariants(probeKey);
if (!winningUrlTemplate) {
  console.error("\nNo endpoint variant returned 200 + JSON. Humble may have changed their API again.");
  console.error("Open https://www.humblebundle.com/home/keys in your browser, open DevTools → Network → XHR, refresh, and look for the call that returns each order's contents. Paste the URL pattern back to the controller.");
  process.exit(2);
}
console.log(`\nWinning endpoint template: ${winningUrlTemplate}\n`);

// Capture more fixtures than we strictly need so the parser sees recent
// shapes (2025/2026 Choice months) alongside older ones, plus bundle/store
// variety. Six gives us subs + a diverse orders sample.
const TARGET_FIXTURES = 6;
let captured = 0;
let skipped = 0;
for (const key of allKeys) {
  if (captured >= TARGET_FIXTURES) break;
  const url = winningUrlTemplate.replace("{KEY}", key);
  const detail = await tryGet(url);
  if (detail === null) {
    skipped++;
    continue;
  }
  const detailObj = detail as { product?: { human_name?: string; category?: string } };
  const label = detailObj.product?.human_name ?? "(unknown)";
  await writeFile(
    `tests/fetcher/fixtures/order-${key}.json`,
    JSON.stringify(sanitize(detail), null, 2)
  );
  console.log(`captured ${key} — ${label} [${detailObj.product?.category ?? "?"}]`);
  captured++;
}
console.log(`done: ${captured} order details captured, ${skipped} skipped (404)`);
