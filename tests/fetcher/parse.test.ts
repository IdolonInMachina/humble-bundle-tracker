import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { parseOrder } from "../../server/fetcher/parse.ts";

const fixtureDir = "tests/fetcher/fixtures";
const orderFiles = readdirSync(fixtureDir).filter((f) => f.startsWith("order-"));
if (orderFiles.length === 0) {
  throw new Error("Run scripts/capture-fixtures.ts to populate fixtures first");
}

describe("parseOrder", () => {
  test.each(orderFiles)("%s: returns a bundle row with stable id and name", (file) => {
    const fixture = JSON.parse(readFileSync(`${fixtureDir}/${file}`, "utf8"));
    const { bundle } = parseOrder(fixture);
    expect(bundle.id).toBeTruthy();
    expect(bundle.name).toBeTruthy();
    expect(["choice", "bundle", "store", "other"]).toContain(bundle.source);
    expect(bundle.rawJson).toBe(JSON.stringify(fixture));
  });

  test.each(orderFiles)("%s: items have valid shape when present", (file) => {
    // Real-world orders can be legitimately empty (e.g., a Humble Choice
    // month the user never selected games for, or the current month before
    // selection). The parser returns []; we validate shape only when items
    // exist.
    const fixture = JSON.parse(readFileSync(`${fixtureDir}/${file}`, "utf8"));
    const { items } = parseOrder(fixture);
    for (const item of items) {
      expect(item.bundleId).toBeTruthy();
      expect(item.machineName).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(["unclaimed", "revealed", "redeemed"]).toContain(item.status);
    }
  });

  test("at least one fixture has populated items", () => {
    // Sanity check: not every fixture is empty. If this fails, our captures
    // are broken (probably wrong endpoint or stripped tpkd_dict).
    const totalItems = orderFiles
      .map((f) => parseOrder(JSON.parse(readFileSync(`${fixtureDir}/${f}`, "utf8"))).items.length)
      .reduce((a, b) => a + b, 0);
    expect(totalItems).toBeGreaterThan(0);
  });

  test.each(orderFiles)("%s: item ids are stable across parses", (file) => {
    const fixture = JSON.parse(readFileSync(`${fixtureDir}/${file}`, "utf8"));
    const a = parseOrder(fixture);
    const b = parseOrder(fixture);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
  });

  test("classifySource hits both choice and store from real fixtures", () => {
    const sources = orderFiles.map((f) => {
      const fixture = JSON.parse(readFileSync(`${fixtureDir}/${f}`, "utf8"));
      return parseOrder(fixture).bundle.source;
    });
    expect(sources).toContain("choice");
    expect(sources).toContain("store");
  });
});

describe("parseOrder + ChoiceMenu", () => {
  // A minimal Choice-shaped raw order: subscriptioncontent category, no
  // tpkds, with one "extra" subproduct already present so we can verify the
  // menu merge runs in addition to (not instead of) existing items.
  const rawChoiceOrder = {
    gamekey: "fake-april",
    created: "2026-04-01T00:00:00Z",
    product: {
      human_name: "Humble Choice April 2026",
      machine_name: "april_2026_choice",
      category: "subscriptioncontent",
      choice_url: "april-2026",
    },
    subproducts: [
      {
        machine_name: "discount_extra",
        human_name: "10% off DLC",
        url: "https://example/discount",
        downloads: [],
      },
    ],
    tpkd_dict: { all_tpks: [] },
  };

  test("merges menu games when bundle.source is choice", () => {
    const menu = {
      games: [
        {
          machineName: "assassinscreed_valhalla",
          title: "Assassin's Creed Valhalla",
          platform: "steam" as const,
        },
        {
          machineName: "lana",
          title: "Planet of Lana",
          platform: "steam" as const,
        },
      ],
    };
    const { bundle, items } = parseOrder(rawChoiceOrder, menu);
    expect(bundle.source).toBe("choice");
    // 1 extra (subproduct) + 2 menu games = 3 items total.
    expect(items.length).toBe(3);
    const machineNames = items.map((i) => i.machineName);
    expect(machineNames).toContain("assassinscreed_valhalla");
    expect(machineNames).toContain("lana");
    expect(machineNames).toContain("discount_extra");
    const valhalla = items.find((i) => i.machineName === "assassinscreed_valhalla");
    expect(valhalla?.status).toBe("unclaimed");
    expect(valhalla?.platform).toBe("steam");
    expect(valhalla?.claimUrl).toBe(bundle.url);
  });

  test("does not duplicate already-revealed games when menu repeats them", () => {
    // Simulate a tpkd that overlaps the menu (user already revealed the key).
    const withRevealed = {
      ...rawChoiceOrder,
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: "lana",
            human_name: "Planet of Lana",
            key_type: "steam",
            redeemed_key_val: "ABCDE-FGHIJ-KLMNO",
          },
        ],
      },
    };
    const menu = {
      games: [
        {
          machineName: "lana",
          title: "Planet of Lana",
          platform: "steam" as const,
        },
        {
          machineName: "valhalla",
          title: "Valhalla",
          platform: "steam" as const,
        },
      ],
    };
    const { items } = parseOrder(withRevealed, menu);
    const lana = items.filter((i) => i.machineName === "lana");
    expect(lana.length).toBe(1);
    // Revealed-status row from tpkd wins; the menu's "unclaimed" entry is
    // skipped, preserving the redeemed key.
    expect(lana[0]!.status).toBe("revealed");
    expect(lana[0]!.keyValue).toBe("ABCDE-FGHIJ-KLMNO");
  });

  test("ignores menu when bundle.source is not choice", () => {
    const storeOrder = {
      gamekey: "fake-store",
      product: {
        human_name: "A Store Purchase",
        category: "storefront",
      },
      subproducts: [],
      tpkd_dict: { all_tpks: [] },
    };
    const menu = {
      games: [
        {
          machineName: "should_not_appear",
          title: "Nope",
          platform: "steam" as const,
        },
      ],
    };
    const { bundle, items } = parseOrder(storeOrder, menu);
    expect(bundle.source).toBe("store");
    expect(items.length).toBe(0);
  });

  test("undefined menu falls back to extras-only behaviour", () => {
    const { items } = parseOrder(rawChoiceOrder);
    expect(items.length).toBe(1);
    expect(items[0]!.machineName).toBe("discount_extra");
  });
});
