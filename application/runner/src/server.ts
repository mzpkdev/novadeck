import { startHttpServer, type HttpOptions, type HttpServer } from "./http.js"
import type { TerminalManagerOptions } from "./terminals/index.js"

export type ServerOptions = HttpOptions &
  Readonly<{
    apiToken?: string
    databasePath?: string
    terminal?: TerminalManagerOptions
    maxConnections?: number
    heartbeatIntervalMs?: number
  }>

export type { HttpServer as Server } from "./http.js"

/** Standalone runner: HTTP status plus a token-authenticated WebSocket runner API. */
export const startServer = async (options: ServerOptions = {}): Promise<HttpServer> => {
  if (options.apiToken === undefined) return startHttpServer(options)
  const { createRunner, serveWebSocket } = await import("./index.js")
  const runner = createRunner({
    ...(options.databasePath !== undefined && { databasePath: options.databasePath }),
    ...(options.terminal !== undefined && { terminal: options.terminal }),
  })
  let sockets: ReturnType<typeof serveWebSocket>
  try {
    sockets = serveWebSocket(runner, {
      token: options.apiToken,
      origins: options.corsOrigins ?? ["http://127.0.0.1:5173"],
      ...(options.maxConnections !== undefined && { maxConnections: options.maxConnections }),
      ...(options.heartbeatIntervalMs !== undefined && {
        heartbeatIntervalMs: options.heartbeatIntervalMs,
      }),
    })
  } catch (error) {
    await runner.close()
    throw error
  }
  return startHttpServer(options, {
    attach: (server) => sockets.attach(server),
    async close() {
      try {
        await sockets.close()
      } finally {
        await runner.close()
      }
    },
  })
}
