import { createRouter, createRoute, redirect } from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as LibraryRoute } from "./routes/Library";
import { Route as SettingsRoute } from "./routes/Settings";
import { Route as BundlesRoute } from "./routes/Bundles";
import { Route as BundleDetailRoute } from "./routes/BundleDetail";
import { Route as ExpiringRoute } from "./routes/Expiring";
import { Route as UnclaimedRoute } from "./routes/Unclaimed";

const indexRedirect = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});

const routeTree = RootRoute.addChildren([
  LibraryRoute,
  SettingsRoute,
  BundlesRoute,
  BundleDetailRoute,
  ExpiringRoute,
  UnclaimedRoute,
  indexRedirect,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
