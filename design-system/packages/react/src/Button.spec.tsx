import { fireEvent, render, screen } from "@testing-library/react"

import { Button } from "./Button"
import { Plus } from "./icons"
import { context, describe, expect, it } from "./test"

describe("Button", () => {
  context("when enabled", () => {
    it("handles click interactions without submitting forms by default", () => {
      let clicked = false

      render(<Button onClick={() => (clicked = true)}>Create deck</Button>)
      const button = screen.getByRole("button", { name: "Create deck" })
      button.focus()
      fireEvent.click(button)

      expect(clicked).toBe(true)
      expect(button).toHaveFocus()
      expect(button).toHaveAttribute("type", "button")
      expect(button).toHaveClass("button", "outlined")
    })

    it("renders icons re-exported by the design system", () => {
      const { container } = render(<Button start={<Plus />}>Create deck</Button>)

      expect(container.querySelector(".lucide-plus")).toBeInTheDocument()
    })
  })

  context("when disabled", () => {
    it("does not handle click interactions", () => {
      let clicked = false

      render(
        <Button disabled onClick={() => (clicked = true)}>
          Create deck
        </Button>,
      )
      fireEvent.click(screen.getByRole("button", { name: "Create deck" }))

      expect(clicked).toBe(false)
    })
  })

  context("when rendered as a link", () => {
    it("removes navigation while disabled", () => {
      render(<Button content="Open deck" disabled href="/decks/one" />)

      const link = screen.getByRole("link", { name: "Open deck" })
      expect(link).not.toHaveAttribute("href")
      expect(link).toHaveAttribute("aria-disabled", "true")
      expect(link).toHaveAttribute("tabindex", "-1")
    })
  })

  context("when an action is in progress", () => {
    it("preserves its name and prevents another activation", () => {
      let clicked = false

      render(
        <Button loading variant="filled" onClick={() => (clicked = true)}>
          Create deck
        </Button>,
      )
      const button = screen.getByRole("button", { name: "Create deck" })
      fireEvent.click(button)

      expect(clicked).toBe(false)
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute("aria-busy", "true")
      expect(button).toHaveClass("filled")
    })
  })
})
