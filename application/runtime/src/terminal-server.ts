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

/** Standalone terminal entry; desktop integration deliberately remains separate. */
export const startRuntime = async (options: RuntimeOptions = {}): Promise<Runtime> => {
  const api =
    options.apiToken === undefined
      ? undefined
      : (await import("./api/server.js")).createApi({
          token: options.apiToken,
          origins: options.corsOrigins ?? ["http://127.0.0.1:5173"],
          ...(options.databasePath !== undefined && { databasePath: options.databasePath }),
          ...(options.terminal !== undefined && { terminal: options.terminal }),
          ...(options.maxConnections !== undefined && { maxConnections: options.maxConnections }),
          ...(options.heartbeatIntervalMs !== undefined && {
            heartbeatIntervalMs: options.heartbeatIntervalMs,
          }),
        })
  return startHttpRuntime(options, api)
}
