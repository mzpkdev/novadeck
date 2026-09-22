import { fireEvent, render, screen, within } from "@testing-library/react"

import { App } from "./App"
import { context, describe, expect, it } from "./test"

describe("NovaDeck workspace", () => {
  context("when changing the layout", () => {
    it("shows a single selected terminal in focus and every terminal without a sidebar in grid", () => {
      render(<App />)
      expect(screen.getByRole("region", { name: "Workspace terminal" })).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Select Dev server" }))
      expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
      expect(screen.queryByRole("region", { name: "Workspace terminal" })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(screen.getAllByRole("region", { name: /terminal$/ })).toHaveLength(6)
      fireEvent.click(screen.getByRole("button", { name: "Focus Git" }))
      expect(screen.getByRole("heading", { name: "Git" })).toBeVisible()
    })
  })

  context("when using the local preview shell", () => {
    it("keeps command output when switching layouts and clears only the current session", () => {
      render(<App />)
      const input = screen.getByRole("textbox", { name: "Command for Workspace" })
      fireEvent.change(input, { target: { value: "echo hello from the mock" } })
      fireEvent.submit(input.closest("form")!)
      expect(screen.getByText("hello from the mock", { exact: true })).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      expect(screen.getByText("hello from the mock", { exact: true })).toBeVisible()
      const gridInput = screen.getByRole("textbox", { name: "Command for Workspace" })
      fireEvent.change(gridInput, { target: { value: "clear" } })
      fireEvent.submit(gridInput.closest("form")!)
      expect(screen.queryByText("hello from the mock", { exact: true })).not.toBeInTheDocument()
      expect(screen.getByText("Runtime listening on :3000")).toBeVisible()
    })
  })

  context("when finding and creating sessions", () => {
    it("filters sessions and opens the chosen result", () => {
      render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "runtime" } })
      fireEvent.click(within(dialog).getByRole("button", { name: /Runtime/ }))
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("adds a selected, empty terminal", () => {
      render(<App />)
      fireEvent.click(screen.getAllByRole("button", { name: "New terminal" })[0]!)
      expect(screen.getByRole("heading", { name: "Terminal 07" })).toBeVisible()
      expect(screen.getByRole("textbox", { name: "Command for Terminal 07" })).toHaveValue("")
      expect(screen.getByText("7 sessions")).toBeVisible()
    })
  })
  context("when managing terminal tabs", () => {
    it("renames a session across layouts and cancels an unfinished rename", () => {
      render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Rename Workspace" }))
      const input = screen.getByRole("textbox", { name: "Rename Workspace" })
      fireEvent.change(input, { target: { value: "  Local shell  " } })
      fireEvent.submit(input.closest("form")!)
      expect(screen.getByRole("heading", { name: "Local shell" })).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Rename Local shell" }))
      const edit = screen.getByRole("textbox", { name: "Rename Local shell" })
      fireEvent.change(edit, { target: { value: "Discard this" } })
      fireEvent.keyDown(edit, { key: "Escape" })
      expect(screen.getByRole("button", { name: "Select Local shell" })).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      expect(screen.getByRole("region", { name: "Local shell terminal" })).toBeVisible()
    })

    it("closes an active terminal, selects its neighbor, and creates a distinct session", () => {
      render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Close Workspace" }))
      expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
      expect(screen.queryByRole("button", { name: "Select Workspace" })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "New terminal" }))
      expect(screen.getByRole("heading", { name: "Terminal 07" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Select Build" })).toBeVisible()
      expect(screen.getByText("6 sessions")).toBeVisible()
    })

    it("shows an empty workspace after the last close and can start again", () => {
      render(<App />)
      for (const name of ["Workspace", "Dev server", "Tests", "Git", "Runtime", "Build"]) {
        fireEvent.click(screen.getByRole("button", { name: `Close ${name}` }))
      }
      expect(screen.getByRole("heading", { name: "No terminals open" })).toBeVisible()
      expect(screen.getByText("0 sessions")).toBeVisible()
      fireEvent.click(screen.getAllByRole("button", { name: "New terminal" })[0]!)
      expect(screen.getByRole("region", { name: "Terminal 07 terminal" })).toBeVisible()
    })
  })
})
