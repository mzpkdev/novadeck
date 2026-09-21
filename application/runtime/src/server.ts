import { serve, type ServerType } from "@hono/node-server"

import { createApp } from "./app.js"

export type RuntimeOptions = Readonly<{
  hostname?: string
  port?: number
}>

export type Runtime = Readonly<{
  origin: string
  close: () => Promise<void>
}>

const close = (server: ServerType): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })

export const startRuntime = (options: RuntimeOptions = {}): Promise<Runtime> => {
  const hostname = options.hostname ?? "127.0.0.1"
  const port = options.port ?? 8787
  const app = createApp()

  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        hostname,
        port,
      },
      (info) => {
        server.off("error", reject)
        resolve({
          origin: `http://${hostname}:${info.port}`,
          close: () => close(server),
        })
      },
    )

    server.once("error", reject)
  })
}
