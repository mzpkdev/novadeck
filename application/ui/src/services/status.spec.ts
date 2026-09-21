import { HttpResponse, http } from "msw"

import { context, describe, expect, it } from "../test"
import { server } from "../test/server"
import { readStatus } from "./status"

describe("service status", () => {
  context("when the service returns a valid response", () => {
    it("reads its status", async () => {
      server.use(
        http.get("https://api.novadeck.test/status", () => HttpResponse.json({ status: "ready" })),
      )

      await expect(readStatus("https://api.novadeck.test/status")).resolves.toEqual({
        status: "ready",
      })
    })
  })

  context("when the service returns an invalid response", () => {
    it("rejects an unexpected payload", async () => {
      server.use(
        http.get("https://api.novadeck.test/status", () => HttpResponse.json({ status: "busy" })),
      )

      await expect(readStatus("https://api.novadeck.test/status")).rejects.toThrow(
        "Status response is invalid",
      )
    })

    it("reports an unsuccessful HTTP response", async () => {
      server.use(
        http.get("https://api.novadeck.test/status", () => new HttpResponse(null, { status: 503 })),
      )

      await expect(readStatus("https://api.novadeck.test/status")).rejects.toThrow(
        "Status request failed with 503",
      )
    })
  })
})
