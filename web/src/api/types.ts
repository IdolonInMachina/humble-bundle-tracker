export type ItemRow = {
  id: string;
  bundleId: string;
  name: string;
  machineName: string;
  platform: "steam" | "gog" | "origin" | "uplay" | "drm-free" | "other";
  status: "unclaimed" | "revealed" | "redeemed";
  keyValue: string | null;
  claimUrl: string | null;
  expiresAt: number | null;
  notes: string | null;
  tags: string | null;
  createdAt: number;
  updatedAt: number;
};

export type BundleRow = {
  id: string;
  name: string;
  source: "choice" | "bundle" | "store" | "other";
  purchasedAt: number | null;
  url: string | null;
  rawJson: string;
  createdAt: number;
  updatedAt: number;
};

export type SyncStatus = {
  running: boolean;
  last: {
    id: number;
    startedAt: number;
    finishedAt: number | null;
    status: "running" | "ok" | "error" | "partial";
    bundlesSeen: number;
    itemsAdded: number;
    itemsUpdated: number;
    error: string | null;
  } | null;
};

export type Health = {
  ok: boolean;
  cookie_ok: boolean;
  last_sync_at: number | null;
};
