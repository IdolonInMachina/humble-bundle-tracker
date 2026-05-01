import { createRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../api/client";
import type { BundleRow } from "../api/types";
import { Route as RootRoute } from "./__root";

function groupByYearMonth(bundles: BundleRow[]): Map<string, BundleRow[]> {
  const m = new Map<string, BundleRow[]>();
  for (const b of bundles) {
    const key = b.purchasedAt
      ? new Date(b.purchasedAt).toISOString().slice(0, 7)
      : "unknown";
    const arr = m.get(key) ?? [];
    arr.push(b);
    m.set(key, arr);
  }
  return m;
}

function Bundles() {
  const { data } = useQuery({ queryKey: ["bundles"], queryFn: api.bundles });
  const bundles = data ?? [];
  const choice = bundles.filter((b) => b.source === "choice");
  const others = bundles.filter((b) => b.source !== "choice");
  const grouped = useMemo(() => groupByYearMonth(choice), [choice]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Bundles</h2>
      <section>
        <h3 className="font-medium mb-2">Humble Choice</h3>
        <ul className="space-y-1">
          {Array.from(grouped.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([month, bs]) => (
              <li key={month}>
                <div className="text-sm text-slate-500">{month}</div>
                <ul className="ml-4">
                  {bs.map((b) => (
                    <li key={b.id}>
                      <Link
                        to="/bundles/$id"
                        params={{ id: b.id }}
                        className="hover:underline"
                      >
                        {b.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      </section>
      <section>
        <h3 className="font-medium mb-2">Other</h3>
        <ul className="space-y-1">
          {others.map((b) => (
            <li key={b.id}>
              <Link
                to="/bundles/$id"
                params={{ id: b.id }}
                className="hover:underline"
              >
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/bundles",
  component: Bundles,
});
