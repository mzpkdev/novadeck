import { render, screen } from "@testing-library/react"

import { App } from "./App"
import { context, describe, expect, it } from "./test"

describe("NovaDeck canvas", () => {
  context("when the application starts", () => {
    it("renders a blank white viewport", () => {
      render(<App />)

      expect(screen.getByRole("main")).toBeEmptyDOMElement()
      expect(screen.getByRole("main")).toHaveClass("min-h-svh", "bg-white")
    })
  })
})
