import {
  startRuntime as startHttpRuntime,
  type Runtime,
  type RuntimeOptions as HttpOptions,
} from "./server.js"
import type { TerminalManagerOptions } from "./terminals/index.js"

export type RuntimeOptions = HttpOptions &
  Readonly<{
    apiToken?: string
    databasePath?: string
    terminal?: TerminalManagerOptions
    maxConnections?: number
    heartbeatIntervalMs?: number
  }>

export type { Runtime } from "./server.js"

/** Standalone runner: HTTP status plus a token-authenticated WebSocket runner API. */
export const startRuntime = async (options: RuntimeOptions = {}): Promise<Runtime> => {
  if (options.apiToken === undefined) return startHttpRuntime(options)
  const { createRunner, serveWebSocket } = await import("./runner/index.js")
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
  return startHttpRuntime(options, {
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
