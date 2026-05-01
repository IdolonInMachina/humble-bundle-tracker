import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

// Sidebar links to /bundles, /expiring, /unclaimed, /settings use plain <a>
// because those routes are added in later tasks. Once registered, they should
// be migrated to <Link> for typed navigation.
export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r p-4 space-y-2">
        <h1 className="font-semibold mb-4">Humble Tracker</h1>
        <nav className="flex flex-col gap-1 text-sm">
          <Link to="/library" className="hover:underline">Library</Link>
          <a href="/bundles" className="hover:underline">Bundles</a>
          <a href="/expiring" className="hover:underline">Expiring</a>
          <a href="/unclaimed" className="hover:underline">Unclaimed</a>
          <a href="/settings" className="hover:underline mt-4">Settings</a>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  ),
});
