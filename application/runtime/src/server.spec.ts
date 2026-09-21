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

  context("when started on an IPv6 host", () => {
    it("returns a valid bracketed origin", async () => {
      const runtime = await startRuntime({ hostname: "::1", port: 0 })

      try {
        const url = new URL(runtime.origin)

        expect(url.hostname).toBe("[::1]")
        await expect(fetch(`${runtime.origin}/api/status`)).resolves.toMatchObject({ ok: true })
      } finally {
        await runtime.close()
      }
    })
  })
})
