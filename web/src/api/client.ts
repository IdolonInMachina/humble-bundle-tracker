import type { Health, ItemRow, BundleRow, SyncStatus } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => get<Health>("/api/health"),
  items: (params: URLSearchParams = new URLSearchParams()) =>
    get<ItemRow[]>(`/api/items?${params.toString()}`),
  patchItem: (id: string, patch: Partial<Pick<ItemRow, "status" | "notes" | "tags">>) =>
    send<ItemRow>(`/api/items/${id}`, "PATCH", patch),
  bundles: () => get<BundleRow[]>("/api/bundles"),
  bundle: (id: string) => get<{ bundle: BundleRow; items: ItemRow[] }>(`/api/bundles/${id}`),
  syncStatus: () => get<SyncStatus>("/api/sync/status"),
  triggerSync: () => send<{ runId: number }>("/api/sync", "POST"),
  settings: () => get<{ hasCookie: boolean; syncIntervalHours: number }>("/api/settings"),
  setCookie: (cookie: string) => send<void>("/api/settings/cookie", "PUT", { cookie }),
};
