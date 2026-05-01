import type { Fetcher, SyncOpts, SyncReport } from "./types.ts";
import { NotImplementedError } from "./types.ts";

export class PlaywrightFetcher implements Fetcher {
  async sync(_opts: SyncOpts): Promise<SyncReport> {
    throw new NotImplementedError("PlaywrightFetcher.sync");
  }
}
