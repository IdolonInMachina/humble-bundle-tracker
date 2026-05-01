import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { ItemTable } from "../components/ItemTable";
import { Route as RootRoute } from "./__root";

function Unclaimed() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data } = useQuery({
    queryKey: ["items", "unclaimed"],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("status", "unclaimed");
      return api.items(p);
    },
  });
  const items = data ?? [];

  const openSelected = async () => {
    const urls = items.filter((i) => selected.has(i.id)).map((i) => i.claimUrl).filter(Boolean) as string[];
    if (!urls.length) return;
    if (!confirm(`Open ${urls.length} tabs?`)) return;
    for (const u of urls) {
      window.open(u, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Unclaimed</h2>
      {selected.size > 0 && (
        <div className="sticky top-0 bg-white border rounded p-2 flex justify-between items-center">
          <span className="text-sm">{selected.size} selected</span>
          <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm" onClick={openSelected}>
            Open {selected.size}
          </button>
        </div>
      )}
      <ItemTable items={items} selectable selected={selected} onSelectionChange={setSelected} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/unclaimed",
  component: Unclaimed,
});
