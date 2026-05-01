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
const allKeys = Array.from(new Set([...orderKeys, ...subKeys]));
console.log(`considering ${orderKeys.length} order + ${subKeys.length} sub keys (${allKeys.length} unique)`);

const TARGET_FIXTURES = 3;
let captured = 0;
let skipped = 0;
for (const key of allKeys) {
  if (captured >= TARGET_FIXTURES) break;
  const detail = await tryGet(
    `https://www.humblebundle.com/api/v1/orders/${key}?all_tpkds=true`
  );
  if (detail === null) {
    skipped++;
    continue;
  }
  await writeFile(
    `tests/fetcher/fixtures/order-${key}.json`,
    JSON.stringify(sanitize(detail), null, 2)
  );
  console.log(`captured detail for order ${key}`);
  captured++;
}
console.log(`done: ${captured} order details captured, ${skipped} skipped (404)`);
