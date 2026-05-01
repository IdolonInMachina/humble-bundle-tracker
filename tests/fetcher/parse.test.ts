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

  test.each(orderFiles)("%s: returns at least one item row", (file) => {
    const fixture = JSON.parse(readFileSync(`${fixtureDir}/${file}`, "utf8"));
    const { items } = parseOrder(fixture);
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.bundleId).toBeTruthy();
    expect(first.machineName).toBeTruthy();
    expect(first.name).toBeTruthy();
    expect(["unclaimed", "revealed", "redeemed"]).toContain(first.status);
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
