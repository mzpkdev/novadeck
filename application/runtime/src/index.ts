import { loadEnvFile } from "node:process"

import { runtimeOptionsFromEnv } from "./config.js"
import { startRuntime } from "./terminal-server.js"

try {
  loadEnvFile()
} catch (error: unknown) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
}

const runtime = await startRuntime(runtimeOptionsFromEnv())

console.log(`NovaDeck runtime listening at ${runtime.origin}`)
if (!process.env.NOVADECK_TOKEN) {
  console.log("Terminal API disabled. Set NOVADECK_TOKEN to enable authenticated access.")
}

const stop = (): void => {
  void runtime.close().then(() => process.exit(0))
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)
