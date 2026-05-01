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

const firstKey = (orders as Array<{ gamekey: string }>)[0]?.gamekey;
if (firstKey) {
  const detail = await get(
    `https://www.humblebundle.com/api/v1/orders/${firstKey}?all_tpkds=true`
  );
  await writeFile(
    `tests/fetcher/fixtures/order-${firstKey}.json`,
    JSON.stringify(sanitize(detail), null, 2)
  );
  console.log(`captured detail for order ${firstKey}`);
}
