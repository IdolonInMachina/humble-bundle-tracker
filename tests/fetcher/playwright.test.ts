import { describe, expect, test } from "bun:test";
import { PlaywrightFetcher } from "../../server/fetcher/playwright.ts";

describe("PlaywrightFetcher (stub)", () => {
  test("sync() throws NotImplemented", async () => {
    const f = new PlaywrightFetcher();
    await expect(f.sync({})).rejects.toThrow(/not implemented/i);
  });
});
