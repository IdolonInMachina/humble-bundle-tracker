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
