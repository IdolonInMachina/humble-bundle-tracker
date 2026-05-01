import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { ItemTable } from "../components/ItemTable";
import { Route as RootRoute } from "./__root";

function BundleDetail() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["bundle", id],
    queryFn: () => api.bundle(id),
  });
  if (!data) return <div>Loading…</div>;

  const unclaimedUrls = data.items
    .filter((i) => i.status === "unclaimed" && i.claimUrl)
    .map((i) => i.claimUrl!) as string[];

  const openAll = async () => {
    if (!confirm(`Open ${unclaimedUrls.length} tabs?`)) return;
    for (const u of unclaimedUrls) {
      window.open(u, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">{data.bundle.name}</h2>
      {unclaimedUrls.length > 0 && (
        <button
          className="px-3 py-1 rounded bg-slate-900 text-white text-sm"
          onClick={openAll}
        >
          Open {unclaimedUrls.length} unclaimed
        </button>
      )}
      <ItemTable items={data.items} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/bundles/$id",
  component: BundleDetail,
});
