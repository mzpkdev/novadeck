import { fireEvent, render, screen } from "@testing-library/react"

import { context, describe, expect, it } from "../../../test"
import { Button } from "./Button"

describe("Button", () => {
  context("when enabled", () => {
    it("handles accessible press interactions", () => {
      let pressed = false

      render(<Button onPress={() => (pressed = true)}>Create deck</Button>)
      fireEvent.click(screen.getByRole("button", { name: "Create deck" }))

      expect(pressed).toBe(true)
    })
  })

  context("when disabled", () => {
    it("does not handle press interactions", () => {
      let pressed = false

      render(
        <Button isDisabled onPress={() => (pressed = true)}>
          Create deck
        </Button>,
      )
      fireEvent.click(screen.getByRole("button", { name: "Create deck" }))

      expect(pressed).toBe(false)
    })
  })
})
