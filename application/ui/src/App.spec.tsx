import { render, screen, within } from "@testing-library/react"
import { HttpResponse, http } from "msw"

import { App } from "./App"
import { context, describe, expect, it } from "./test"
import { server } from "./test/server"

describe("NovaDeck shell", () => {
  context("when the runtime is ready", () => {
    it("shows the product and runtime status", async () => {
      server.use(http.get("*/api/status", () => HttpResponse.json({ status: "ready" })))

      render(<App />)

      expect(screen.getByRole("heading", { name: "NovaDeck" })).toBeInTheDocument()
      expect(
        await within(screen.getByRole("complementary", { name: "Runtime status" })).findByText(
          "Runtime ready",
        ),
      ).toBeInTheDocument()
    })
  })
})
