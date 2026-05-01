// Fetch the /membership/<slug> HTML and locate the embedded contentChoiceData
// JSON blob so we can write an extractor.
// Usage: HUMBLE_COOKIE='...' bun run scripts/probe-choice-html.ts [slug]

const cookie = process.env.HUMBLE_COOKIE;
if (!cookie) {
  console.error("Set HUMBLE_COOKIE env var");
  process.exit(1);
}

const slug = process.argv[2] ?? "april-2026";
const url = `https://www.humblebundle.com/membership/${slug}`;

const res = await fetch(url, {
  headers: {
    Cookie: `_simpleauth_sess=${cookie}`,
    "User-Agent": "Mozilla/5.0",
    Accept: "text/html",
  },
});

if (!res.ok) {
  console.error(`${res.status} ${res.statusText} for ${url}`);
  process.exit(1);
}

const html = await res.text();
console.log(`Fetched ${html.length} bytes from ${url}`);

// Look for the script tags / variables that contain the data.
// Common patterns: __NEXT_DATA__, __INITIAL_STATE__, hb-template tags, data-* attrs.
const patterns = [
  { name: '<script id="...content_choice...">', re: /<script[^>]*id="[^"]*content_choice[^"]*"[^>]*>/i },
  { name: '<script id="webpack-...">', re: /<script[^>]*id="webpack-[^"]*"[^>]*>/i },
  { name: '<script id="contentChoice...">', re: /<script[^>]*id="contentChoice[^"]*"[^>]*>/i },
  { name: '<script id="__NEXT_DATA__">', re: /<script[^>]*id="__NEXT_DATA__"[^>]*>/i },
  { name: 'window.__INITIAL_STATE__', re: /window\.__INITIAL_STATE__\s*=/ },
  { name: 'hb-template name="..."', re: /<script[^>]*type="hb\/[^"]*"[^>]*name="[^"]*"/g },
  { name: '<script type="application/json">', re: /<script[^>]*type="application\/json"[^>]*>/g },
  { name: '<script type="application/ld+json">', re: /<script[^>]*type="application\/ld\+json"[^>]*>/g },
];

console.log("\n=== Pattern hits ===");
for (const { name, re } of patterns) {
  const matches = html.match(re);
  if (matches) {
    console.log(`  HIT ${name}: ${matches.length} match(es)`);
  } else {
    console.log(`  miss ${name}`);
  }
}

// Find each <script id="..."> and report length + whether it contains our markers
console.log("\n=== <script id=\"X\"> tags ===");
const scriptIdRegex = /<script[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g;
let m: RegExpExecArray | null;
while ((m = scriptIdRegex.exec(html)) !== null) {
  const id = m[1] ?? "";
  const body = m[2] ?? "";
  const hasContentChoice = body.includes("contentChoiceData");
  const hasGameData = body.includes("game_data");
  if (body.length < 100 && !hasContentChoice && !hasGameData) continue;
  console.log(`  id="${id}" len=${body.length} contentChoiceData=${hasContentChoice} game_data=${hasGameData}`);
}

// Also look for hb-specific template tags
console.log("\n=== <script type=\"text/x-template\"> or hb/* template tags ===");
const tmplRegex = /<script[^>]*type="(text\/x-template|hb\/[^"]+)"[^>]*(?:name|id)="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g;
while ((m = tmplRegex.exec(html)) !== null) {
  const kind = m[1] ?? "";
  const id = m[2] ?? "";
  const body = m[3] ?? "";
  const hasContentChoice = body.includes("contentChoiceData");
  const hasGameData = body.includes("game_data");
  if (body.length < 100 && !hasContentChoice && !hasGameData) continue;
  console.log(`  type=${kind} name="${id}" len=${body.length} contentChoiceData=${hasContentChoice} game_data=${hasGameData}`);
}

// Find the line containing contentChoiceData and dump ~200 chars of context
console.log("\n=== contentChoiceData first occurrence (200 char context) ===");
const idx = html.indexOf("contentChoiceData");
if (idx > 0) {
  const start = Math.max(0, idx - 100);
  const end = Math.min(html.length, idx + 200);
  console.log(html.slice(start, end));
}

// Try to find the variable assignment
console.log("\n=== Common variable patterns near contentChoiceData ===");
const around = html.slice(Math.max(0, idx - 500), idx);
console.log(around);
