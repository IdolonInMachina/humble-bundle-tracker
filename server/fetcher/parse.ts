import { createHash } from "node:crypto";

type RawTpk = {
  machine_name: string;
  human_name: string;
  key_type?: string;
  key_type_human_name?: string;
  redeemed_key_val?: string | null;
  expiration_date_string?: string | null;
  gamekey?: string;
  sold_out?: boolean;
  is_gift?: boolean;
};

type RawSubproduct = {
  machine_name: string;
  human_name: string;
  url?: string;
  payee?: { human_name?: string };
  downloads?: Array<{ platform?: string }>;
  library_family_name?: string | null;
};

type RawOrder = {
  gamekey: string;
  created?: string;
  product?: { human_name?: string; machine_name?: string; category?: string };
  subproducts?: RawSubproduct[];
  tpkd_dict?: { all_tpks?: RawTpk[] };
};

export type ParsedBundle = {
  id: string;
  name: string;
  source: "choice" | "bundle" | "store" | "other";
  purchasedAt: number | null;
  url: string | null;
  rawJson: string;
};

export type ParsedItem = {
  id: string;
  bundleId: string;
  name: string;
  machineName: string;
  platform: "steam" | "gog" | "origin" | "uplay" | "drm-free" | "other";
  status: "unclaimed" | "revealed" | "redeemed";
  keyValue: string | null;
  claimUrl: string | null;
  expiresAt: number | null;
};

export type ParseResult = {
  bundle: ParsedBundle;
  items: ParsedItem[];
};

const PLATFORM_MAP: Record<string, ParsedItem["platform"]> = {
  steam: "steam",
  gog: "gog",
  origin: "origin",
  uplay: "uplay",
  ubisoft_connect: "uplay",
};

function classifySource(raw: RawOrder): ParsedBundle["source"] {
  const cat = raw.product?.category?.toLowerCase() ?? "";
  const name = raw.product?.human_name?.toLowerCase() ?? "";
  if (
    cat.includes("subscription") ||
    name.includes("humble choice") ||
    name.includes("humble monthly")
  ) {
    return "choice";
  }
  if (cat.includes("storefront")) return "store";
  if (cat.includes("bundle")) return "bundle";
  return "other";
}

function classifyPlatform(
  keyType: string | undefined,
  downloads: Array<{ platform?: string }> | undefined,
): ParsedItem["platform"] {
  const k = keyType?.toLowerCase() ?? "";
  if (k && PLATFORM_MAP[k]) return PLATFORM_MAP[k]!;
  const d = downloads?.[0]?.platform?.toLowerCase();
  if (
    d === "windows" ||
    d === "mac" ||
    d === "linux" ||
    d === "audio" ||
    d === "ebook"
  ) {
    return "drm-free";
  }
  return "other";
}

function classifyStatus(tpk: RawTpk): ParsedItem["status"] {
  if (tpk.redeemed_key_val) return "revealed";
  return "unclaimed";
}

function hashId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function parseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

export function parseOrder(raw: RawOrder): ParseResult {
  const bundleId = raw.gamekey;
  const bundle: ParsedBundle = {
    id: bundleId,
    name: raw.product?.human_name ?? `Order ${bundleId}`,
    source: classifySource(raw),
    purchasedAt: parseDate(raw.created),
    url: bundleId ? `https://www.humblebundle.com/downloads?key=${bundleId}` : null,
    rawJson: JSON.stringify(raw),
  };

  const items: ParsedItem[] = [];

  // Items with keys (Steam, GOG, etc.) come from tpkd_dict.all_tpks.
  for (const tpk of raw.tpkd_dict?.all_tpks ?? []) {
    items.push({
      id: hashId(bundleId, tpk.machine_name),
      bundleId,
      name: tpk.human_name,
      machineName: tpk.machine_name,
      platform: classifyPlatform(tpk.key_type, undefined),
      status: classifyStatus(tpk),
      keyValue: tpk.redeemed_key_val ?? null,
      claimUrl: bundle.url,
      expiresAt: parseDate(tpk.expiration_date_string),
    });
  }

  // DRM-free or library entries from subproducts that aren't already represented by a tpk.
  const seenMachineNames = new Set(items.map((i) => i.machineName));
  for (const sp of raw.subproducts ?? []) {
    if (seenMachineNames.has(sp.machine_name)) continue;
    items.push({
      id: hashId(bundleId, sp.machine_name),
      bundleId,
      name: sp.human_name,
      machineName: sp.machine_name,
      platform: classifyPlatform(undefined, sp.downloads),
      status: "revealed",
      keyValue: null,
      claimUrl: sp.url ?? bundle.url,
      expiresAt: null,
    });
  }

  return { bundle, items };
}
