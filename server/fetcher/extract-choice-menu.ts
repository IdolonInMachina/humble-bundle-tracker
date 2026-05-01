// Humble Choice month bundles don't expose their game menu via the order
// detail JSON endpoint — that endpoint only returns "extras" (DLC discount
// codes) and any tpkd entries the user has already revealed. The actual menu
// of selectable games for the month lives in a JSON blob embedded in the
// `/membership/<slug>` HTML page, inside a script tag with the id
// `webpack-monthly-product-data`.
//
// This module extracts that menu defensively: missing/malformed data returns
// null rather than throwing, so a failed scrape degrades to "extras only"
// rather than killing the whole sync.

export type ChoiceMenuGame = {
  machineName: string;
  title: string;
  platform: "steam" | "gog" | "origin" | "uplay" | "drm-free" | "other";
};

export type ChoiceMenu = {
  games: ChoiceMenuGame[];
};

const SCRIPT_ID_RE =
  /<script[^>]*id="webpack-monthly-product-data"[^>]*>([\s\S]*?)<\/script>/;

export function extractChoiceMenu(html: string): ChoiceMenu | null {
  const match = html.match(SCRIPT_ID_RE);
  if (!match || !match[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }
  // Walk to contentChoiceData with defensive checks at each step.
  const ccd = (parsed as { contentChoiceOptions?: { contentChoiceData?: unknown } })
    ?.contentChoiceOptions?.contentChoiceData;
  if (!ccd || typeof ccd !== "object") return null;
  const ccdObj = ccd as { display_order?: unknown; game_data?: unknown };
  const order = Array.isArray(ccdObj.display_order)
    ? (ccdObj.display_order as unknown[])
    : [];
  const data =
    ccdObj.game_data && typeof ccdObj.game_data === "object"
      ? (ccdObj.game_data as Record<string, unknown>)
      : {};

  const games: ChoiceMenuGame[] = [];
  for (const key of order) {
    if (typeof key !== "string") continue;
    const g = data[key];
    if (!g || typeof g !== "object") continue;
    const obj = g as { title?: unknown; delivery_methods?: unknown };
    const title = typeof obj.title === "string" ? obj.title : key;
    const delivery = Array.isArray(obj.delivery_methods) ? obj.delivery_methods : [];
    const first = typeof delivery[0] === "string" ? delivery[0].toLowerCase() : null;
    let platform: ChoiceMenuGame["platform"] = "other";
    if (first === "steam") platform = "steam";
    else if (first === "gog") platform = "gog";
    else if (first === "origin") platform = "origin";
    else if (first === "uplay" || first === "ubisoft_connect") platform = "uplay";
    games.push({ machineName: key, title, platform });
  }
  return { games };
}
