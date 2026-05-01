import { CookieFetcher } from "./cookie.ts";
import { PlaywrightFetcher } from "./playwright.ts";
import type { Fetcher } from "./types.ts";

export function makeFetcher(): Fetcher {
  const mode = process.env.FETCHER_MODE ?? "cookie";
  if (mode === "playwright") return new PlaywrightFetcher();
  return new CookieFetcher();
}
