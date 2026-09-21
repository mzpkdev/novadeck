import { createApp } from "./app.js"
import { context, describe, expect, it } from "./test.js"

describe("runtime application", () => {
  context("when its status is requested", () => {
    it("reports that the service is ready", async () => {
      const response = await createApp().request("http://localhost/api/status")

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ status: "ready" })
    })
  })

  context("when an unknown API route is requested", () => {
    it("returns not found", async () => {
      const response = await createApp().request("http://localhost/api/missing")

      expect(response.status).toBe(404)
    })
  })

  context("when a frontend route is requested", () => {
    it("leaves frontend delivery to its host", async () => {
      const response = await createApp().request("http://localhost/")

      expect(response.status).toBe(404)
    })
  })
})
