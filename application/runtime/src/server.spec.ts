import { startRuntime } from "./server.js"
import { context, describe, expect, it } from "./test.js"

describe("runtime server", () => {
  context("when started on an ephemeral port", () => {
    it("serves the Hono application and closes cleanly", async () => {
      const runtime = await startRuntime({ port: 0 })

      try {
        const response = await fetch(`${runtime.origin}/api/status`)

        await expect(response.json()).resolves.toEqual({ status: "ready" })
      } finally {
        await runtime.close()
      }
    })
  })
})
