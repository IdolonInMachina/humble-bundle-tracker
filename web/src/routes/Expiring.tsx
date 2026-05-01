import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ItemRow } from "../api/types";
import { Route as RootRoute } from "./__root";
import { StatusBadge } from "../components/StatusBadge";

function urgencyColor(ms: number | null): string {
  if (!ms) return "";
  const days = (ms - Date.now()) / 86_400_000;
  if (days < 7) return "bg-red-50";
  if (days < 30) return "bg-amber-50";
  return "";
}

function Expiring() {
  const { data } = useQuery({
    queryKey: ["items", "expiring"],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("expiringWithin", "365");
      p.set("sort", "expiresAt");
      return api.items(p);
    },
  });

  const items: ItemRow[] = (data ?? [])
    .filter((i) => i.status !== "redeemed" && i.expiresAt !== null)
    .sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0));

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Expiring soon</h2>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className={`flex justify-between p-2 rounded ${urgencyColor(i.expiresAt)}`}>
            <span>{i.name}</span>
            <span className="text-sm flex gap-3 items-center">
              <StatusBadge status={i.status} />
              <span className="text-slate-600">{i.expiresAt ? new Date(i.expiresAt).toLocaleDateString() : ""}</span>
              {i.claimUrl && <a href={i.claimUrl} target="_blank" rel="noreferrer" className="underline">open</a>}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="text-slate-500 text-sm">Nothing expiring.</li>}
      </ul>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/expiring",
  component: Expiring,
});
