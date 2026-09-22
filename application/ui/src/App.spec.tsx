import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach } from "vitest"

import { App } from "./App"
import { context, describe, expect, it } from "./test"

const switchTo = (name: string): void => {
  fireEvent.click(screen.getByRole("button", { name: "Switch workspace" }))
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Switch workspace" })).getByRole("button", {
      name: new RegExp(name),
    }),
  )
}

describe("NovaDeck workspace", () => {
  beforeEach(() => localStorage.clear())
  context("when limiting available view modes", () => {
    it("keeps search in Focus when both windowed modes are disabled", () => {
      localStorage.setItem(
        "novadeck.preferences",
        JSON.stringify({ fontSize: 13, enabledViews: ["focus"] }),
      )
      render(<App />)
      expect(screen.queryByRole("button", { name: "Grid" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Canvas" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Open in/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      expect(within(dialog).getByText("Open in Focus")).toBeVisible()
      fireEvent.click(within(dialog).getByRole("button", { name: /Runtime/ }))
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
    })

    it("starts in Grid and omits fullscreen actions when Focus is disabled", () => {
      localStorage.setItem(
        "novadeck.preferences",
        JSON.stringify({ fontSize: 13, enabledViews: ["grid"] }),
      )
      localStorage.setItem("novadeck.windowed-view", "canvas")
      render(<App />)
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(screen.queryByRole("button", { name: /^Focus/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("link", { name: "NovaDeck home" }))
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      expect(within(dialog).getByText("Open in Grid")).toBeVisible()
      const input = within(dialog).getByRole("textbox")
      fireEvent.change(input, { target: { value: "Runtime" } })
      fireEvent.keyDown(input, { key: "Enter" })
      expect(
        screen.getByRole("region", { name: "Runtime terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
    })

    it("recovers from an empty or invalid saved mode list", () => {
      localStorage.setItem("novadeck.preferences", JSON.stringify({ enabledViews: ["invalid"] }))
      render(<App />)
      const navigation = within(screen.getByRole("navigation", { name: "Workspace layout" }))
      expect(navigation.getAllByRole("button")).toHaveLength(3)
      expect(navigation.getByRole("button", { name: "Focus" })).toHaveAttribute(
        "aria-pressed",
        "true",
      )
    })
  })

  context("when switching mock workspaces", () => {
    it("keeps terminal names, closed tabs, and command history separate for each project", () => {
      render(<App />)
      const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      fireEvent.change(command, { target: { value: "echo storefront history" } })
      fireEvent.submit(command.closest("form")!)
      fireEvent.click(screen.getByRole("button", { name: "Rename Checkout implementation" }))
      const name = screen.getByRole("textbox", { name: "Rename Checkout implementation" })
      fireEvent.change(name, { target: { value: "Shop shell" } })
      fireEvent.submit(name.closest("form")!)
      fireEvent.click(screen.getByRole("button", { name: "Close Checkout review" }))
      switchTo("api-service")
      expect(screen.getByRole("button", { name: "Select Checkout review" })).toBeVisible()
      expect(screen.queryByText("storefront history", { exact: true })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Switch workspace" })).toHaveAttribute(
        "title",
        "~/projects/api-service",
      )
      switchTo("storefront")
      expect(screen.getByRole("heading", { name: "Shop shell" })).toBeVisible()
      expect(screen.getByText("storefront history", { exact: true })).toBeVisible()
      expect(
        screen.queryByRole("button", { name: "Select Checkout review" }),
      ).not.toBeInTheDocument()
    })

    it("creates an empty project and starts terminals in its directory", () => {
      render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Switch workspace" }))
      fireEvent.click(screen.getByRole("button", { name: "Create workspace" }))
      expect(screen.getByRole("button", { name: "Create" })).toBeDisabled()
      const name = screen.getByRole("textbox", { name: "New workspace" })
      fireEvent.change(name, { target: { value: "  docs-site  " } })
      fireEvent.submit(name.closest("form")!)
      expect(screen.getByRole("heading", { name: "No terminals open" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Switch workspace" })).toHaveTextContent(
        "docs-site",
      )
      fireEvent.click(screen.getAllByRole("button", { name: "New terminal" })[0]!)
      const command = screen.getByRole("textbox", { name: "Command for Terminal 01" })
      fireEvent.change(command, { target: { value: "pwd" } })
      fireEvent.submit(command.closest("form")!)
      expect(screen.getByText("/Users/alex/projects/docs-site", { exact: true })).toBeVisible()
      switchTo("storefront")
      expect(screen.getByText("6 sessions")).toBeVisible()
      switchTo("docs-site")
      expect(screen.getByRole("heading", { name: "Terminal 01" })).toBeVisible()
      expect(screen.getByText("/Users/alex/projects/docs-site", { exact: true })).toBeVisible()
    })
  })

  context("when collapsing the desktop sidebar", () => {
    it("hides sidebar controls without remounting the active terminal", () => {
      render(<App />)
      const input = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      fireEvent.change(input, { target: { value: "echo draft" } })
      fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(screen.queryByRole("separator", { name: "Resize sidebar" })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
        "aria-expanded",
        "false",
      )
      expect(screen.getByRole("textbox", { name: "Command for Checkout implementation" })).toBe(
        input,
      )
      expect(input).toHaveValue("echo draft")
      fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }))
      expect(screen.getByRole("complementary")).toBeVisible()
      expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeVisible()
      expect(input).toHaveValue("echo draft")
    })

    it("remembers the collapsed state across layouts and app mounts", () => {
      const first = render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }))
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(localStorage.getItem("novadeck.sidebar-collapsed")).toBe("true")
      first.unmount()
      render(<App />)
      expect(screen.getByRole("button", { name: "Show sidebar" })).toBeEnabled()
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }))
      expect(localStorage.getItem("novadeck.sidebar-collapsed")).toBe("false")
    })
  })

  context("when changing the layout", () => {
    it("opens the active fullscreen terminal in Grid before any maximize action", () => {
      render(<App />)
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      fireEvent.click(screen.getByRole("button", { name: "Select Checkout review" }))
      fireEvent.click(screen.getByRole("button", { name: "Open in Grid" }))
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(
        screen.getByRole("region", { name: "Checkout review terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
    })

    it("opens a renamed fullscreen terminal in the preferred windowed mode", () => {
      render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      fireEvent.click(screen.getByRole("button", { name: "Focus Checkout review" }))
      fireEvent.click(screen.getByRole("button", { name: "Rename Checkout review" }))
      const name = screen.getByRole("textbox", { name: "Rename Checkout review" })
      fireEvent.change(name, { target: { value: "Changes" } })
      fireEvent.submit(name.closest("form")!)
      fireEvent.click(screen.getByRole("button", { name: "Open in Grid" }))
      expect(
        screen.getByRole("region", { name: "Changes terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
    })

    it("keeps the windowed action available after switching or closing fullscreen terminals", () => {
      render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      fireEvent.click(screen.getByRole("button", { name: "Focus Checkout review" }))
      fireEvent.click(screen.getByRole("button", { name: "Select Checkout implementation" }))
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      fireEvent.click(
        within(screen.getByRole("region", { name: "Checkout implementation terminal" })).getByRole(
          "button",
          {
            name: "Close Checkout implementation",
          },
        ),
      )
      fireEvent.click(screen.getByRole("button", { name: "Open in Grid" }))
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(
        screen.queryByRole("region", { name: "Checkout implementation terminal" }),
      ).not.toBeInTheDocument()
    })

    it("remembers Canvas across fullscreen, remounts, and search without choosing Grid", () => {
      const first = render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Canvas" }))
      fireEvent.click(screen.getByRole("button", { name: "Focus" }))
      expect(screen.getByRole("button", { name: "Open in Canvas" })).toBeEnabled()
      expect(localStorage.getItem("novadeck.windowed-view")).toBe("canvas")
      first.unmount()
      render(<App />)
      expect(screen.getByRole("button", { name: "Open in Canvas" })).toBeEnabled()
      fireEvent.click(screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      expect(within(dialog).getByText("Open in Canvas")).toBeVisible()
      const input = within(dialog).getByRole("textbox")
      fireEvent.change(input, { target: { value: "runtime" } })
      fireEvent.keyDown(input, { key: "Enter" })
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Select Runtime" })).toHaveAttribute(
        "aria-current",
        "true",
      )
      expect(localStorage.getItem("novadeck.windowed-view")).toBe("canvas")
    })

    it("replaces the preference when Grid is selected and ignores invalid saved modes", () => {
      localStorage.setItem("novadeck.windowed-view", "invalid")
      render(<App />)
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      fireEvent.click(screen.getByRole("button", { name: "Canvas" }))
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      fireEvent.click(screen.getByRole("button", { name: "Focus" }))
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      expect(localStorage.getItem("novadeck.windowed-view")).toBe("grid")
    })

    it("shows a single selected terminal in focus and uses sidebar tabs to select grid terminals", () => {
      render(<App />)
      expect(screen.getByRole("region", { name: "Checkout implementation terminal" })).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Select Dev server" }))
      expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
      expect(
        screen.queryByRole("region", { name: "Checkout implementation terminal" }),
      ).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      expect(screen.getByRole("complementary")).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Select Checkout review" }))
      expect(
        screen.getByRole("region", { name: "Checkout review terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
      expect(screen.getAllByRole("region", { name: /terminal$/ })).toHaveLength(6)
      fireEvent.click(screen.getByRole("button", { name: "Focus Checkout review" }))
      expect(screen.getByRole("heading", { name: "Checkout review" })).toBeVisible()
    })
  })

  context("when using the local preview shell", () => {
    it("keeps command output when switching layouts and clears only the current session", () => {
      render(<App />)
      const input = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      fireEvent.change(input, { target: { value: "echo hello from the mock" } })
      fireEvent.submit(input.closest("form")!)
      expect(screen.getByText("hello from the mock", { exact: true })).toBeVisible()
      fireEvent.click(screen.getByRole("button", { name: "Grid" }))
      expect(screen.getByText("hello from the mock", { exact: true })).toBeVisible()
      const gridInput = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
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
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(
        screen.getByRole("region", { name: "Runtime terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
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
      fireEvent.click(screen.getByRole("button", { name: "Rename Checkout implementation" }))
      const input = screen.getByRole("textbox", { name: "Rename Checkout implementation" })
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
      fireEvent.click(
        within(screen.getByRole("region", { name: "Checkout implementation terminal" })).getByRole(
          "button",
          {
            name: "Close Checkout implementation",
          },
        ),
      )
      expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
      expect(
        screen.queryByRole("button", { name: "Select Checkout implementation" }),
      ).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "New terminal" }))
      expect(screen.getByRole("heading", { name: "Terminal 07" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Select Build" })).toBeVisible()
      expect(screen.getByText("6 sessions")).toBeVisible()
    })

    it("shows an empty workspace after the last close and can start again", () => {
      render(<App />)
      for (const name of [
        "Checkout implementation",
        "Dev server",
        "Tests",
        "Checkout review",
        "Runtime",
        "Build",
      ]) {
        fireEvent.click(
          within(screen.getByRole("complementary")).getByRole("button", { name: `Close ${name}` }),
        )
      }
      expect(screen.getByRole("heading", { name: "No terminals open" })).toBeVisible()
      expect(screen.getByText("0 sessions")).toBeVisible()
      fireEvent.click(screen.getAllByRole("button", { name: "New terminal" })[0]!)
      expect(screen.getByRole("region", { name: "Terminal 07 terminal" })).toBeVisible()
    })
  })
})
