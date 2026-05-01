export type SyncReport = {
  startedAt: number;
  finishedAt: number;
  status: "ok" | "error" | "partial";
  bundlesSeen: number;
  itemsAdded: number;
  itemsUpdated: number;
  error: string | null;
};

export type SyncOpts = {
  since?: Date;
};

export interface Fetcher {
  sync(opts: SyncOpts): Promise<SyncReport>;
}

export class CookieExpiredError extends Error {
  constructor() {
    super("Humble cookie expired or invalid");
    this.name = "CookieExpiredError";
  }
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} not implemented`);
    this.name = "NotImplementedError";
  }
}
