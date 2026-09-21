import { loadEnvFile } from "node:process"

import { runtimeOptionsFromEnv } from "./config.js"
import { startRuntime } from "./server.js"

try {
  loadEnvFile()
} catch (error: unknown) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
}

const runtime = await startRuntime(runtimeOptionsFromEnv())

console.log(`NovaDeck runtime listening at ${runtime.origin}`)

const stop = (): void => {
  void runtime.close().then(() => process.exit(0))
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)
