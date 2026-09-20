import { Button } from "@novadeck/design-system"
import { render, screen } from "@testing-library/react"

import { context, describe, expect, it } from "../../test"

describe("design system package", () => {
  context("when consumed by the application", () => {
    it("renders its public Button export", () => {
      render(<Button>Create deck</Button>)

      expect(screen.getByRole("button", { name: "Create deck" })).toHaveAttribute("type", "button")
    })
  })
})
