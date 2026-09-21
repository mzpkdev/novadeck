import { startRuntime } from "./server.js"

const port = Number(process.env.PORT ?? "8787")

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error("PORT must be an integer between 0 and 65535")
}

const runtime = await startRuntime({ port })

console.log(`NovaDeck runtime listening at ${runtime.origin}`)

const stop = (): void => {
  void runtime.close().then(() => process.exit(0))
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)
