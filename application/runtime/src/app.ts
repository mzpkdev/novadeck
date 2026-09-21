import { Hono } from "hono"

export const createApp = (): Hono => {
  const app = new Hono()

  app.get("/api/status", (context) => context.json({ status: "ready" } as const))
  app.all("/api/*", (context) => context.notFound())

  return app
}
