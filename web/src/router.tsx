import { createRouter, createRoute, redirect } from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as LibraryRoute } from "./routes/Library";
import { Route as SettingsRoute } from "./routes/Settings";

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
  indexRedirect,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
