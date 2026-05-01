import {
  createRootRoute,
  Link,
  Outlet,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../api/client";

// Sidebar links to /expiring, /unclaimed use plain <a> because those routes are
// added in later tasks (20, 21). Once registered, they should migrate to <Link>
// for typed navigation.
export const Route = createRootRoute({
  component: Shell,
});

function Shell() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const navigate = useNavigate();
  const location = useLocation();

  // First-launch redirect: if no cookie is configured, push the user to
  // /settings so they can paste one before any other view fails to fetch.
  useEffect(() => {
    if (
      settings.data &&
      !settings.data.hasCookie &&
      !location.pathname.startsWith("/settings")
    ) {
      navigate({ to: "/settings" });
    }
  }, [settings.data, location.pathname, navigate]);

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r p-4 space-y-2">
        <h1 className="font-semibold mb-4">Humble Tracker</h1>
        <nav className="flex flex-col gap-1 text-sm">
          <Link to="/library" className="[&.active]:font-semibold">
            Library
          </Link>
          <Link to="/bundles" className="[&.active]:font-semibold">
            Bundles
          </Link>
          <a href="/expiring" className="hover:underline">
            Expiring
          </a>
          <a href="/unclaimed" className="hover:underline">
            Unclaimed
          </a>
          <Link to="/settings" className="mt-4 [&.active]:font-semibold">
            Settings
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        {settings.data &&
          !settings.data.hasCookie &&
          !location.pathname.startsWith("/settings") && (
            <div className="mb-4 p-3 border rounded bg-amber-50 text-amber-900 text-sm">
              No Humble cookie set. Configure it in Settings to start syncing.
            </div>
          )}
        <Outlet />
      </main>
    </div>
  );
}
