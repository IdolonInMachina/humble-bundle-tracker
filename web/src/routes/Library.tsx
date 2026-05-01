import { createRoute } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/library",
  component: () => <div>Library (TODO)</div>,
});
