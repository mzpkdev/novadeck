import { format } from "node:url"

import { serve, type ServerType } from "@hono/node-server"

import { createApp } from "./app.js"

export type RuntimeOptions = Readonly<{
  hostname?: string
  port?: number
  corsOrigins?: readonly string[]
}>

export type RuntimeService = {
  attach(server: ServerType): void
  close(): Promise<void>
}

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

// This entry stays HTTP-only so existing Electron builds do not bundle native terminal code.
export const startRuntime = async (
  options: RuntimeOptions = {},
  service?: RuntimeService,
): Promise<Runtime> => {
  const hostname = options.hostname ?? "127.0.0.1"
  const port = options.port ?? 8787
  const app = options.corsOrigins ? createApp({ corsOrigins: options.corsOrigins }) : createApp()

  try {
    return await new Promise((resolve, reject) => {
      let closing: Promise<void> | undefined
      const server = serve(
        {
          fetch: app.fetch,
          hostname,
          port,
        },
        (info) => {
          server.off("error", reject)
          resolve({
            origin: format({ hostname, port: info.port, protocol: "http" }),
            close: () => {
              closing ??= (async () => {
                try {
                  await service?.close()
                } finally {
                  await close(server)
                }
              })()
              return closing
            },
          })
        },
      )

      server.once("error", reject)
      service?.attach(server)
    })
  } catch (error) {
    await service?.close()
    throw error
  }
}
