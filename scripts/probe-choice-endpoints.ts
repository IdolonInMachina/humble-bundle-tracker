// Probe candidate endpoints for fetching Humble Choice month game menus.
// Usage: HUMBLE_COOKIE='...' bun run scripts/probe-choice-endpoints.ts

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

const slugs = ["april-2026", "march-2026"];

const candidates = [
  (s: string) => `/api/v1/contentchoice/${s}`,
  (s: string) => `/api/v1/contentchoice/${s}/products`,
  (s: string) => `/api/v1/contentchoice/${s}/content_choice_data`,
  (s: string) => `/api/v1/membership/${s}`,
  (s: string) => `/api/v1/membership/${s}/products`,
  (s: string) => `/api/v1/products/contentchoice/${s}`,
  (s: string) => `/api/v1/subscription_content/${s}`,
  (s: string) => `/api/v1/subscriptions/humble_monthly/content_choices/${s}`,
  (s: string) => `/api/v2/contentchoice/${s}`,
  (s: string) => `/membership/${s}`, // HTML page; might have JSON in a script tag
];

const BASE = "https://www.humblebundle.com";

for (const slug of slugs) {
  console.log(`\n=== Probing for slug "${slug}" ===`);
  for (const make of candidates) {
    const path = make(slug);
    const url = `${BASE}${path}`;
    try {
      const res = await fetch(url, { headers, redirect: "manual" });
      const ct = res.headers.get("content-type") ?? "";
      const ctShort = ct.split(";")[0] ?? "";
      let extra = "";
      if (res.ok && ct.includes("json")) {
        const text = await res.text();
        // Hint at whether the response contains game-menu data
        const hasGameData = /"game_data"/.test(text);
        const hasContentChoice = /"contentChoiceData"/.test(text);
        const hasDisplayOrder = /"display_order"/.test(text);
        const hints = [
          hasGameData && "game_data",
          hasContentChoice && "contentChoiceData",
          hasDisplayOrder && "display_order",
        ].filter(Boolean).join(",");
        extra = ` len=${text.length}${hints ? ` hints=[${hints}]` : ""}`;
      } else if (res.ok && ct.includes("html")) {
        const text = await res.text();
        const hasContentChoice = /"contentChoiceData"\s*:/.test(text);
        const hasGameData = /"game_data"\s*:/.test(text);
        extra = ` len=${text.length} html${hasContentChoice ? " has-contentChoiceData" : ""}${hasGameData ? " has-game_data" : ""}`;
      }
      console.log(`  ${res.status} ${ctShort.padEnd(20)} ${path}${extra}`);
    } catch (e) {
      console.log(`  ERR ${path}: ${(e as Error).message}`);
    }
  }
}
