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

      expect(
        screen.getByRole("heading", { name: "NovaDeck Assistant" }).closest("main"),
      ).toHaveAttribute("data-theme", "light")
      expect(screen.getByRole("button", { name: "New chat" })).toHaveClass("button", "filled")
      expect(
        screen.getByRole("textbox", { name: "Message NovaDeck Assistant" }).parentElement,
      ).toHaveClass("textarea", "outlined")
      expect(screen.getByText("launch-outline.deck").closest("article")).toHaveClass(
        "card",
        "fluid",
      )
      expect(
        await within(screen.getByRole("complementary", { name: "Runtime status" })).findByText(
          "Runtime ready",
        ),
      ).toBeInTheDocument()
    })
  })
})
