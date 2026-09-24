import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
        const reveal = within(dock).queryByRole("button", { name: "Show Zen controls" })
        if (reveal) await click(reveal)
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
      const reveal = within(dock).queryByRole("button", { name: "Show Zen controls" })
      if (reveal) await click(reveal)
      await click(within(dock).getByRole("button", { name: "New terminal" }))
      expect(screen.getByRole("textbox", { name: "Command for Terminal 07" })).toBeVisible()
      const reopen = within(dock).queryByRole("button", { name: "Show Zen controls" })
      if (reopen) await click(reopen)
      await click(within(dock).getByRole("button", { name: "Exit Zen" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    })
  })
  for (const view of ["Canvas", "Grid", "Focus"]) {
    it(`switches to ${view} inside Zen`, async () => {
      render(<App />)
      await click(screen.getByRole("button", { name: "Enter Zen mode" }))
      const dock = screen.getByRole("group", { name: "Zen controls" })
      const reveal = within(dock).queryByRole("button", { name: "Show Zen controls" })
      if (reveal) await click(reveal)
      await click(within(dock).getByRole("button", { name: `${view} view` }))
      expect(screen.getByRole("region", { name: `${view.toLowerCase()} view` })).toBeVisible()
      expect(screen.queryByRole("button", { name: "Fit all terminals" })).not.toBeInTheDocument()
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    })
  }
  for (const zen of [false, true]) {
    it(`switches Focus terminals from the icon with Zen ${zen ? "on" : "off"} and preserves drafts`, async () => {
      render(<App />)
      if (zen) await click(screen.getByRole("button", { name: "Enter Zen mode" }))
      fireEvent.change(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
        { target: { value: "unfinished command" } },
      )
      await click(screen.getByRole("button", { name: "Switch terminal" }))
      expect(screen.getByRole("option", { name: /Checkout implementation/ })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      await click(screen.getByRole("option", { name: /Dev server/ }))
      expect(screen.getByRole("textbox", { name: "Command for Dev server" })).toBeVisible()
      await click(screen.getByRole("button", { name: "Switch terminal" }))
      await click(screen.getByRole("option", { name: /Checkout implementation/ }))
      expect(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
      ).toHaveValue("unfinished command")
      const trigger = screen.getByRole("button", { name: "Switch terminal" })
      await click(trigger)
      await waitFor(() => expect(screen.getByRole("listbox")).toHaveFocus())
      await act(async () => {
        fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" })
      })
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
      expect(trigger).toHaveFocus()
      expect(screen.getByRole("heading", { name: "Checkout implementation" })).toBeVisible()
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      if (zen) expect(screen.getByRole("group", { name: "Zen controls" })).toBeVisible()
    })
  }
  for (const view of ["Focus", "Grid", "Canvas"]) {
    it(`creates terminals immediately in Zen ${view} without a placement step`, async () => {
      render(<App />)
      await click(screen.getByRole("radio", { name: view }))
      await click(screen.getByRole("button", { name: "Enter Zen mode" }))
      const dock = screen.getByRole("group", { name: "Zen controls" })
      await click(within(dock).getByRole("button", { name: "New terminal" }))
      expect(screen.getByRole("textbox", { name: "Command for Terminal 07" })).toBeVisible()
      const firstName = screen.getByRole("textbox", { name: "Rename Terminal 07" })
      expect(firstName).toHaveFocus()
      await act(async () => {
        fireEvent.keyDown(firstName, { key: "Escape" })
      })
      await click(within(dock).getByRole("button", { name: "New terminal" }))
      expect(screen.getByRole("textbox", { name: "Command for Terminal 08" })).toBeVisible()
      await act(async () => {
        fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename Terminal 08" }), {
          key: "Escape",
        })
      })
      await click(within(dock).getByRole("button", { name: "Show Zen controls" }))
      await click(within(dock).getByRole("button", { name: "Focus view" }))
      await click(screen.getByRole("button", { name: "Switch terminal" }))
      expect(screen.getByRole("option", { name: /Terminal 07/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /Terminal 08/ })).toBeInTheDocument()
    })
  }
})
