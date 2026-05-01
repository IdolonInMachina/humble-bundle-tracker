import { Hono } from "hono";
import { health } from "./routes/health.ts";

export const app = new Hono().basePath("/api").route("/health", health);

export type AppType = typeof app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 5173);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`server listening on http://localhost:${port}`);
}
