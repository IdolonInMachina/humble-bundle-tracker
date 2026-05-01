import { describe, expect, test } from "bun:test";
import { extractChoiceMenu } from "../../server/fetcher/extract-choice-menu.ts";

const buildHtml = (payload: unknown): string =>
  `<html><body><script id="webpack-monthly-product-data">${JSON.stringify(payload)}</script></body></html>`;

describe("extractChoiceMenu", () => {
  test("extracts games in display order", () => {
    const html = buildHtml({
      contentChoiceOptions: {
        contentChoiceData: {
          display_order: ["assassinscreed_valhalla", "lana"],
          game_data: {
            assassinscreed_valhalla: {
              title: "Assassin's Creed Valhalla",
              delivery_methods: ["steam"],
            },
            lana: { title: "Planet of Lana", delivery_methods: ["steam"] },
          },
        },
      },
    });
    const menu = extractChoiceMenu(html);
    expect(menu?.games.length).toBe(2);
    expect(menu?.games[0]).toMatchObject({
      machineName: "assassinscreed_valhalla",
      title: "Assassin's Creed Valhalla",
      platform: "steam",
    });
    expect(menu?.games[1]).toMatchObject({
      machineName: "lana",
      title: "Planet of Lana",
      platform: "steam",
    });
  });

  test("maps non-steam delivery_methods to expected platforms", () => {
    const html = buildHtml({
      contentChoiceOptions: {
        contentChoiceData: {
          display_order: ["a", "b", "c", "d"],
          game_data: {
            a: { title: "A", delivery_methods: ["gog"] },
            b: { title: "B", delivery_methods: ["uplay"] },
            c: { title: "C", delivery_methods: ["ubisoft_connect"] },
            d: { title: "D", delivery_methods: ["epic"] },
          },
        },
      },
    });
    const menu = extractChoiceMenu(html);
    expect(menu?.games[0]!.platform).toBe("gog");
    expect(menu?.games[1]!.platform).toBe("uplay");
    expect(menu?.games[2]!.platform).toBe("uplay");
    expect(menu?.games[3]!.platform).toBe("other");
  });

  test("returns null when no script tag present", () => {
    expect(extractChoiceMenu("<html></html>")).toBeNull();
  });

  test("returns null when JSON is malformed", () => {
    expect(
      extractChoiceMenu(
        `<script id="webpack-monthly-product-data">not json</script>`,
      ),
    ).toBeNull();
  });

  test("returns empty games when game_data missing for a key", () => {
    const html = buildHtml({
      contentChoiceOptions: {
        contentChoiceData: { display_order: ["x"], game_data: {} },
      },
    });
    expect(extractChoiceMenu(html)?.games.length).toBe(0);
  });

  test("returns null when contentChoiceData is missing entirely", () => {
    const html = buildHtml({ contentChoiceOptions: {} });
    expect(extractChoiceMenu(html)).toBeNull();
  });

  test("falls back to machine name when title is missing", () => {
    const html = buildHtml({
      contentChoiceOptions: {
        contentChoiceData: {
          display_order: ["mystery_game"],
          game_data: { mystery_game: { delivery_methods: ["steam"] } },
        },
      },
    });
    const menu = extractChoiceMenu(html);
    expect(menu?.games[0]).toMatchObject({
      machineName: "mystery_game",
      title: "mystery_game",
      platform: "steam",
    });
  });
});
