import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api } from "../api/client";
import type { ItemRow } from "../api/types";
import { ItemTable } from "../components/ItemTable";
import { Route as RootRoute } from "./__root";

function Library() {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (platform) p.set("platform", platform);
    if (status) p.set("status", status);
    return p;
  }, [q, platform, status]);

  const { data } = useQuery({
    queryKey: ["items", params.toString()],
    queryFn: () => api.items(params),
  });

  const items: ItemRow[] = data ?? [];

  const openSelected = async () => {
    const urls = items.filter((i) => selected.has(i.id)).map((i) => i.claimUrl).filter(Boolean) as string[];
    if (urls.length === 0) return;
    if (!confirm(`Open ${urls.length} tabs? Allow popups for this site if prompted.`)) return;
    for (const url of urls) {
      window.open(url, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Library</h2>
      <div className="flex gap-2">
        <input
          autoFocus
          className="border rounded px-2 py-1 flex-1"
          placeholder="search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="border rounded px-2" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">all platforms</option>
          {["steam", "gog", "origin", "uplay", "drm-free", "other"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="border rounded px-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">all statuses</option>
          {["unclaimed", "revealed", "redeemed", "expired"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {selected.size > 0 && (
        <div className="sticky top-0 bg-white border rounded p-2 flex justify-between items-center">
          <span className="text-sm">{selected.size} selected</span>
          <div className="flex gap-2">
            <button className="text-sm underline" onClick={() => setSelected(new Set())}>clear</button>
            <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm" onClick={openSelected}>
              Open {selected.size} claim pages
            </button>
          </div>
        </div>
      )}
      <ItemTable items={items} selectable selected={selected} onSelectionChange={setSelected} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/library",
  component: Library,
});
