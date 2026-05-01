import { createRouter, createRoute, redirect } from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as LibraryRoute } from "./routes/Library";

const indexRedirect = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});

const routeTree = RootRoute.addChildren([LibraryRoute, indexRedirect]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
