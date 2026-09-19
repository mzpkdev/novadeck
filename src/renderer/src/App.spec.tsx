import { render, screen, within } from "@testing-library/react"

import { context, describe, expect, it } from "../../test"
import { App } from "./App"

describe("NovaDeck shell", () => {
  context("when the preload API is ready", () => {
    it("shows the product and Electron runtime", () => {
      render(<App />)

      expect(screen.getByRole("heading", { name: "NovaDeck" })).toBeInTheDocument()
      expect(
        within(screen.getByRole("complementary", { name: "Runtime versions" })).getByText("44.4.3"),
      ).toBeInTheDocument()
    })
  })
})
