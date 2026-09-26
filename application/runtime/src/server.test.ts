import { startRuntime } from "./server.js"
import { describe, expect, it } from "./test.js"

describe("runtime server", () => {
  it("serves the application on an ephemeral port and closes cleanly", async () => {
    const runtime = await startRuntime({ port: 0 })

    try {
      const response = await fetch(`${runtime.origin}/api/status`)

      await expect(response.json()).resolves.toEqual({ status: "ready" })
    } finally {
      await runtime.close()
    }
  })

  it("returns a bracketed IPv6 origin", async () => {
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
