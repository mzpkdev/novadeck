import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach } from "vitest"

import { context, describe, expect, it } from "../test"
import { App } from "./App"

const click = async (element: Element): Promise<void> => {
  await act(async () => {
    fireEvent.click(element)
  })
}

describe("Zen workspace", () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, "", "/")
  })
  context("when entering and leaving the current view", () => {
    for (const view of ["Focus", "Grid", "Canvas"] as const) {
      it(`keeps the ${view} terminal mounted and restores the sidebar`, async () => {
        render(<App />)
        await click(screen.getByRole("radio", { name: view }))
        const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
        fireEvent.change(command, { target: { value: "unfinished command" } })
        await click(screen.getByRole("button", { name: "Enter Zen mode" }))
        expect(screen.getByRole("region", { name: `${view.toLowerCase()} view` })).toBeVisible()
        expect(screen.getByRole("textbox", { name: "Command for Checkout implementation" })).toBe(
          command,
        )
        expect(command).toHaveValue("unfinished command")
        expect(screen.queryByRole("button", { name: "Enter Zen mode" })).not.toBeInTheDocument()
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
        const dock = screen.getByRole("group", { name: "Zen controls" })
        expect(within(dock).getByRole("button", { name: `${view} view` })).toHaveAttribute(
          "aria-pressed",
          "true",
        )
        await click(within(dock).getByRole("button", { name: "Exit Zen" }))
        expect(screen.queryByRole("group", { name: "Zen controls" })).not.toBeInTheDocument()
        expect(screen.getByRole("complementary")).toBeVisible()
        expect(screen.getByRole("textbox", { name: "Command for Checkout implementation" })).toBe(
          command,
        )
      })
    }
    it("restores a collapsed sidebar after creating a terminal in Zen", async () => {
      render(<App />)
      await click(screen.getByRole("button", { name: "Hide terminals" }))
      await click(screen.getByRole("button", { name: "Enter Zen mode" }))
      const dock = screen.getByRole("group", { name: "Zen controls" })
      await click(within(dock).getByRole("button", { name: "New terminal" }))
      expect(screen.getByRole("textbox", { name: "Command for Terminal 07" })).toBeVisible()
      await click(within(dock).getByRole("button", { name: "Exit Zen" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    })
  })
  for (const view of ["Canvas", "Grid", "Focus"]) {
    it(`switches to ${view} inside Zen`, async () => {
      render(<App />)
      await click(screen.getByRole("button", { name: "Enter Zen mode" }))
      const dock = screen.getByRole("group", { name: "Zen controls" })
      await click(within(dock).getByRole("button", { name: `${view} view` }))
      expect(screen.getByRole("region", { name: `${view.toLowerCase()} view` })).toBeVisible()
      expect(screen.queryByRole("button", { name: "Fit all terminals" })).not.toBeInTheDocument()
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    })
  }
  it("keeps placement active across Grid and Canvas and lets Escape cancel it", async () => {
    render(<App />)
    await click(screen.getByRole("radio", { name: "Grid" }))
    await click(screen.getByRole("button", { name: "Enter Zen mode" }))
    const dock = screen.getByRole("group", { name: "Zen controls" })
    await click(within(dock).getByRole("button", { name: "New terminal" }))
    expect(within(dock).getByRole("button", { name: "New terminal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await click(within(dock).getByRole("button", { name: "Canvas view" }))
    expect(within(dock).getByRole("button", { name: "New terminal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" })
    })
    expect(within(dock).getByRole("button", { name: "New terminal" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    expect(screen.getByRole("group", { name: "Zen controls" })).toBeVisible()
  })
})
