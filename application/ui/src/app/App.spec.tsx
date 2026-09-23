import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach } from "vitest"

import { context, describe, expect, it } from "../test"
import { App } from "./App"

const interact = async (
  type: "click" | "doubleClick" | "change" | "keyDown" | "submit",
  element: Element,
  options?: object,
): Promise<void> => {
  await act(async () => {
    fireEvent[type](element, options)
  })
}

const switchTo = async (name: string): Promise<void> => {
  await interact("click", screen.getByRole("button", { name: "Switch workspace" }))
  await interact(
    "click",
    within(screen.getByRole("dialog", { name: "Switch workspace" })).getByRole("button", {
      name: new RegExp(name),
    }),
  )
}

const currentSessionName = (): string =>
  within(screen.getByRole("list", { name: "Saved sessions" }))
    .getByRole("button", { current: true })
    .getAttribute("aria-label")!

describe("novadeck. workspace", () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, "", "/")
  })
  context("when minimizing a Grid terminal", () => {
    it("retains drafts and folded state across views without folding Canvas or Focus", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      const input = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      await interact("change", input, { target: { value: "unfinished command" } })
      await interact(
        "click",
        screen.getByRole("button", { name: "Minimize Checkout implementation" }),
      )
      expect(input.closest(".terminal-content")).toHaveAttribute("inert")
      expect(
        screen.queryByRole("textbox", { name: "Command for Checkout implementation" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "Restore Checkout implementation" }),
      ).toHaveAttribute("aria-expanded", "false")
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      expect(
        screen.getByRole("button", { name: "Minimize Checkout implementation" }),
      ).toHaveAttribute("aria-expanded", "true")
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      expect(screen.getByRole("button", { name: "Restore Checkout implementation" })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: "Focus Checkout implementation" }))
      expect(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
      ).toHaveValue("unfinished command")
      expect(
        screen.queryByRole("button", { name: "Restore Checkout implementation" }),
      ).not.toBeInTheDocument()
      await interact("click", screen.getByRole("button", { name: "Open in Grid" }))
      await interact(
        "click",
        screen.getByRole("button", { name: "Restore Checkout implementation" }),
      )
      expect(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
      ).toHaveValue("unfinished command")
    })
  })
  context("when limiting available view modes", () => {
    it("keeps search in Focus when both windowed modes are disabled", async () => {
      localStorage.setItem(
        "novadeck.preferences",
        JSON.stringify({ fontSize: 13, enabledViews: ["focus"] }),
      )
      render(<App />)
      expect(screen.queryByRole("radio", { name: "Grid" })).not.toBeInTheDocument()
      expect(screen.queryByRole("radio", { name: "Canvas" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Open in/ })).not.toBeInTheDocument()
      await interact("click", screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      expect(within(dialog).getByText("Open in Focus")).toBeVisible()
      await interact("click", within(dialog).getByRole("option", { name: /Runtime/ }))
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
    })

    it("starts in Grid and omits fullscreen actions when Focus is disabled", async () => {
      localStorage.setItem(
        "novadeck.preferences",
        JSON.stringify({ fontSize: 13, enabledViews: ["grid"] }),
      )
      localStorage.setItem("novadeck.windowed-view", "canvas")
      render(<App />)
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(screen.queryByRole("radio", { name: /^Focus/ })).not.toBeInTheDocument()
      await interact("click", screen.getByRole("link", { name: "novadeck. home" }))
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      expect(within(dialog).getByText("Open in Grid")).toBeVisible()
      const input = within(dialog).getByRole("combobox")
      await interact("change", input, { target: { value: "Runtime" } })
      await interact("keyDown", input, { key: "Enter" })
      expect(
        screen.getByRole("region", { name: "Runtime terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
    })

    it("recovers from an empty or invalid saved mode list", async () => {
      localStorage.setItem("novadeck.preferences", JSON.stringify({ enabledViews: ["invalid"] }))
      render(<App />)
      const navigation = within(screen.getByRole("radiogroup", { name: "Workspace layout" }))
      expect(navigation.getAllByRole("radio")).toHaveLength(3)
      expect(navigation.getByRole("radio", { name: "Focus" })).toBeChecked()
    })
  })

  context("when switching mock workspaces", () => {
    it("keeps terminal names, closed tabs, and command history separate for each project", async () => {
      render(<App />)
      const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      await interact("change", command, { target: { value: "echo storefront history" } })
      await interact("submit", command.closest("form")!)
      await interact(
        "click",
        screen.getByRole("button", { name: "Rename Checkout implementation" }),
      )
      const name = screen.getByRole("textbox", { name: "Rename Checkout implementation" })
      await interact("change", name, { target: { value: "Shop shell" } })
      await interact("keyDown", name, { key: "Enter" })
      await interact("click", screen.getByRole("button", { name: "Close Checkout review" }))
      await switchTo("api-service")
      expect(screen.getByRole("button", { name: "Select Checkout review" })).toBeVisible()
      expect(screen.queryByText("storefront history", { exact: true })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Switch workspace" })).toHaveAttribute(
        "title",
        "~/projects/api-service",
      )
      await switchTo("storefront")
      expect(screen.getByRole("heading", { name: "Shop shell" })).toBeVisible()
      expect(screen.getByText("storefront history", { exact: true })).toBeVisible()
      expect(
        screen.queryByRole("button", { name: "Select Checkout review" }),
      ).not.toBeInTheDocument()
    })

    it("keeps opening folders disabled until the native picker is available", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Switch workspace" }))
      expect(screen.getByRole("button", { name: "Open folder…" })).toBeDisabled()
      expect(screen.queryByRole("textbox", { name: /workspace/i })).not.toBeInTheDocument()
    })
  })

  context("when creating a session", () => {
    it("keeps previous terminals, output, drafts, and selection while opening an empty session", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Select Runtime" }))
      const input = screen.getByRole("textbox", { name: "Command for Runtime" })
      await interact("change", input, { target: { value: "echo saved output" } })
      await interact("submit", input.closest("form")!)
      await interact("change", input, { target: { value: "echo unfinished" } })
      await interact("click", screen.getByRole("radio", { name: "Sessions" }))
      const morning = currentSessionName()
      await interact("click", screen.getByRole("button", { name: "New session" }))
      expect(screen.getByRole("heading", { name: "No terminals open" })).toBeVisible()
      expect(screen.getByRole("button", { name: morning })).toHaveTextContent("6 terminals")
      expect(screen.getByRole("button", { name: morning })).toHaveTextContent("5 running")
      const afternoon = currentSessionName()
      await interact("click", screen.getByRole("button", { name: "New terminal" }))
      const fresh = screen.getByRole("textbox", { name: "Command for Terminal 01" })
      expect(fresh).toHaveValue("")
      await interact("change", fresh, { target: { value: "new draft" } })
      await interact("click", screen.getByRole("radio", { name: "Sessions" }))
      await interact("click", screen.getByRole("button", { name: morning }))
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
      expect(screen.getByRole("textbox", { name: "Command for Runtime" })).toHaveValue(
        "echo unfinished",
      )
      expect(screen.getByText("saved output", { exact: true })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: afternoon }))
      expect(screen.getByRole("textbox", { name: "Command for Terminal 01" })).toHaveValue(
        "new draft",
      )
      expect(screen.queryByText("saved output", { exact: true })).not.toBeInTheDocument()
    })

    it("keeps sessions within their project and restores the last active one", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Sessions" }))
      const morning = within(screen.getByRole("list", { name: "Saved sessions" })).getByRole(
        "button",
        { current: true },
      )
      const morningName = currentSessionName()
      await interact("click", screen.getByRole("button", { name: "New session" }))
      const afternoon = currentSessionName()
      await switchTo("api-service")
      expect(morning).not.toBeInTheDocument()
      expect(
        within(screen.getByRole("list", { name: "Saved sessions" })).getAllByRole("listitem"),
      ).toHaveLength(1)
      const api = currentSessionName()
      await switchTo("storefront")
      expect(screen.getByRole("button", { name: afternoon })).toHaveAttribute(
        "aria-current",
        "true",
      )
      expect(screen.getByRole("heading", { name: "No terminals open" })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: morningName }))
      expect(screen.getByRole("heading", { name: "Checkout implementation" })).toBeVisible()
      await switchTo("api-service")
      expect(screen.getByRole("button", { name: api })).toHaveAttribute("aria-current", "true")
    })

    it("restores each session's selected view", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact("click", screen.getByRole("radio", { name: "Sessions" }))
      const grid = currentSessionName()
      await interact("click", screen.getByRole("button", { name: "New session" }))
      const focus = currentSessionName()
      await interact("click", screen.getByRole("radio", { name: "Focus" }))
      await interact("click", screen.getByRole("button", { name: grid }))
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: focus }))
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
    })
  })

  context("when toggling sidebar panels", () => {
    it("shows only the chosen panel and lets either toggle or close button hide it", async () => {
      render(<App />)
      const terminals = screen.getByRole("radio", { name: "Terminals" })
      const sessions = screen.getByRole("radio", { name: "Sessions" })
      const input = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      await interact("change", input, { target: { value: "keep my draft" } })
      expect(terminals).toHaveAttribute("aria-checked", "true")
      expect(sessions).toHaveAttribute("aria-checked", "false")
      await interact("click", sessions)
      expect(terminals).toHaveAttribute("aria-checked", "false")
      expect(sessions).toHaveAttribute("aria-checked", "true")
      expect(screen.queryByRole("button", { name: "Select Runtime" })).not.toBeInTheDocument()
      await interact("click", terminals)
      expect(sessions).toHaveAttribute("aria-checked", "false")
      expect(screen.getByRole("button", { name: "Select Runtime" })).toBeVisible()
      await interact("click", sessions)
      await interact("click", sessions)
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(terminals).toHaveAttribute("aria-checked", "false")
      expect(sessions).toHaveAttribute("aria-checked", "false")
      await interact("click", sessions)
      await interact("click", screen.getByRole("button", { name: "Hide sessions" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(sessions).toHaveFocus()
      await interact("click", terminals)
      await interact("click", screen.getByRole("button", { name: "Hide terminals" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(terminals).toHaveFocus()
      expect(screen.getByRole("textbox", { name: "Command for Checkout implementation" })).toBe(
        input,
      )
      expect(input).toHaveValue("keep my draft")
    })
  })

  context("when collapsing the desktop sidebar", () => {
    it("hides sidebar controls without remounting the active terminal", async () => {
      render(<App />)
      const input = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      await interact("change", input, { target: { value: "echo draft" } })
      await interact("click", screen.getByRole("radio", { name: "Terminals" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(screen.queryByRole("separator", { name: "Resize sidebar" })).not.toBeInTheDocument()
      expect(screen.getByRole("radio", { name: "Terminals" })).toHaveAttribute(
        "aria-expanded",
        "false",
      )
      expect(screen.getByRole("textbox", { name: "Command for Checkout implementation" })).toBe(
        input,
      )
      expect(input).toHaveValue("echo draft")
      await interact("click", screen.getByRole("radio", { name: "Terminals" }))
      expect(screen.getByRole("complementary")).toBeVisible()
      expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeVisible()
      expect(input).toHaveValue("echo draft")
    })

    it("remembers the collapsed state across layouts and app mounts", async () => {
      const first = render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Terminals" }))
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      expect(localStorage.getItem("novadeck.sidebar-collapsed")).toBe("true")
      first.unmount()
      render(<App />)
      expect(screen.getByRole("radio", { name: "Terminals" })).toBeEnabled()
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
      await interact("click", screen.getByRole("radio", { name: "Terminals" }))
      expect(localStorage.getItem("novadeck.sidebar-collapsed")).toBe("false")
    })
  })

  context("when changing the layout", () => {
    it("opens the active fullscreen terminal in Grid before any maximize action", async () => {
      render(<App />)
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      await interact("click", screen.getByRole("button", { name: "Select Checkout review" }))
      await interact("click", screen.getByRole("button", { name: "Open in Grid" }))
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(
        screen.getByRole("region", { name: "Checkout review terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
    })

    it("opens a renamed fullscreen terminal in the preferred windowed mode", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact("click", screen.getByRole("button", { name: "Focus Checkout review" }))
      await interact("click", screen.getByRole("button", { name: "Rename Checkout review" }))
      const name = screen.getByRole("textbox", { name: "Rename Checkout review" })
      await interact("change", name, { target: { value: "Changes" } })
      await interact("keyDown", name, { key: "Enter" })
      await interact("click", screen.getByRole("button", { name: "Open in Grid" }))
      expect(
        screen.getByRole("region", { name: "Changes terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
    })

    it("keeps the windowed action available after switching or closing fullscreen terminals", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact("click", screen.getByRole("button", { name: "Focus Checkout review" }))
      await interact(
        "click",
        screen.getByRole("button", { name: "Select Checkout implementation" }),
      )
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      await interact(
        "click",
        within(screen.getByRole("region", { name: "Checkout implementation terminal" })).getByRole(
          "button",
          {
            name: "Close Checkout implementation",
          },
        ),
      )
      await interact("click", screen.getByRole("button", { name: "Open in Grid" }))
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(
        screen.queryByRole("region", { name: "Checkout implementation terminal" }),
      ).not.toBeInTheDocument()
    })

    it("keeps search in Focus after remount while retaining Canvas for windowed return", async () => {
      const first = render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      await interact("click", screen.getByRole("radio", { name: "Focus" }))
      expect(screen.getByRole("button", { name: "Open in Canvas" })).toBeEnabled()
      expect(localStorage.getItem("novadeck.windowed-view")).toBe("canvas")
      first.unmount()
      render(<App />)
      expect(screen.getByRole("button", { name: "Open in Canvas" })).toBeEnabled()
      await interact("click", screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      expect(within(dialog).getByText("Open in Focus")).toBeVisible()
      const input = within(dialog).getByRole("combobox")
      await interact("change", input, { target: { value: "runtime" } })
      await interact("keyDown", input, { key: "Enter" })
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Select Runtime" })).toHaveAttribute(
        "aria-current",
        "true",
      )
      expect(localStorage.getItem("novadeck.windowed-view")).toBe("canvas")
    })

    for (const previous of ["Grid", "Canvas"] as const) {
      for (const entry of ["navigation", "maximize"] as const) {
        it(`keeps a clicked search result in Focus entered by ${entry} from ${previous}`, async () => {
          render(<App />)
          await interact("click", screen.getByRole("radio", { name: previous }))
          await interact(
            "click",
            screen.getByRole(entry === "navigation" ? "radio" : "button", {
              name: entry === "navigation" ? "Focus" : "Focus Checkout implementation",
            }),
          )
          await interact("click", screen.getByRole("button", { name: "Find a terminal" }))
          const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
          expect(within(dialog).getByText("Open in Focus")).toBeVisible()
          await interact("click", within(dialog).getByRole("option", { name: /Runtime/ }))
          expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
          expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
          await interact("click", screen.getByRole("button", { name: `Open in ${previous}` }))
          expect(
            screen.getByRole("region", { name: `${previous.toLowerCase()} view` }),
          ).toBeVisible()
        })
      }
    }

    it("replaces the preference when Grid is selected and ignores invalid saved modes", async () => {
      localStorage.setItem("novadeck.windowed-view", "invalid")
      render(<App />)
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact("click", screen.getByRole("radio", { name: "Focus" }))
      expect(screen.getByRole("button", { name: "Open in Grid" })).toBeEnabled()
      expect(localStorage.getItem("novadeck.windowed-view")).toBe("grid")
    })

    it("shows a single selected terminal in focus and uses sidebar tabs to select grid terminals", async () => {
      render(<App />)
      expect(screen.getByRole("region", { name: "Checkout implementation terminal" })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
      expect(
        screen.queryByRole("region", { name: "Checkout implementation terminal" }),
      ).not.toBeInTheDocument()
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      expect(screen.getByRole("complementary")).toBeVisible()
      await interact("click", screen.getByRole("button", { name: "Select Checkout review" }))
      expect(
        screen.getByRole("region", { name: "Checkout review terminal" }).closest(".grid-terminal"),
      ).toHaveClass("selected")
      expect(screen.getAllByRole("region", { name: /terminal$/ })).toHaveLength(6)
      await interact("click", screen.getByRole("button", { name: "Focus Checkout review" }))
      expect(screen.getByRole("heading", { name: "Checkout review" })).toBeVisible()
    })
  })

  context("when moving Canvas terminals with the keyboard", () => {
    it("moves by the requested step without snapping the other axis", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      const node = screen
        .getByRole("region", { name: "Checkout implementation terminal" })
        .closest<HTMLElement>(".react-flow__node")!
      expect(node).toHaveStyle({ transform: "translate(80px,80px)" })
      await interact("keyDown", node, { key: "ArrowRight" })
      expect(node).toHaveStyle({ transform: "translate(104px,80px)" })
      await interact("keyDown", node, { key: "ArrowDown", shiftKey: true })
      expect(node).toHaveStyle({ transform: "translate(104px,176px)" })
    })
  })

  context("when toggling views from a terminal header", () => {
    for (const view of ["grid", "canvas"] as const) {
      it(`returns to ${view} and back to Focus without changing the terminal`, async () => {
        localStorage.setItem("novadeck.windowed-view", view)
        const app = render(<App />)
        const header = (): HTMLElement =>
          app.getByRole("heading", { name: "Checkout implementation" }).closest("header")!
        await interact("doubleClick", header())
        expect(screen.getByRole("region", { name: `${view} view` })).toBeVisible()
        await interact("doubleClick", header())
        expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
        expect(screen.getByRole("heading", { name: "Checkout implementation" })).toBeVisible()
      })
    }

    it("ignores double-clicks originating from header buttons", async () => {
      render(<App />)
      const terminal = screen.getByRole("region", { name: "Checkout implementation terminal" })
      await interact(
        "doubleClick",
        within(terminal).getByRole("button", { name: "Close Checkout implementation" }),
      )
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(terminal).toBeVisible()
    })

    it("does nothing when windowed modes are unavailable", async () => {
      localStorage.setItem("novadeck.preferences", JSON.stringify({ enabledViews: ["focus"] }))
      render(<App />)
      await interact(
        "doubleClick",
        screen.getByRole("heading", { name: "Checkout implementation" }).closest("header")!,
      )
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
    })
  })

  context("when using the local preview shell", () => {
    it("keeps command output when switching layouts and clears only the current session", async () => {
      render(<App />)
      const input = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      await interact("change", input, { target: { value: "echo hello from the mock" } })
      await interact("submit", input.closest("form")!)
      expect(screen.getByText("hello from the mock", { exact: true })).toBeVisible()
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      expect(screen.getByText("hello from the mock", { exact: true })).toBeVisible()
      const gridInput = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      await interact("change", gridInput, { target: { value: "clear" } })
      await interact("submit", gridInput.closest("form")!)
      expect(screen.queryByText("hello from the mock", { exact: true })).not.toBeInTheDocument()
      expect(screen.getByText("Runtime listening on :3000")).toBeVisible()
    })
  })

  context("when finding and creating sessions", () => {
    it("opens the keyboard-highlighted search result", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Find a terminal" }))
      const input = screen.getByRole("combobox", { name: "Search terminals" })
      await interact("keyDown", input, { key: "End" })
      await interact("keyDown", input, { key: "Enter" })
      expect(screen.getByRole("heading", { name: "Build" })).toBeVisible()
      expect(screen.queryByRole("dialog", { name: "Find a terminal" })).not.toBeInTheDocument()
    })

    it("filters sessions and opens the chosen result", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Find a terminal" }))
      const dialog = screen.getByRole("dialog", { name: "Find a terminal" })
      await interact("change", within(dialog).getByRole("combobox"), {
        target: { value: "runtime" },
      })
      await interact("click", within(dialog).getByRole("option", { name: /Runtime/ }))
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
      expect(screen.getAllByRole("region", { name: /terminal$/ })).toHaveLength(1)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("adds a selected, empty terminal", async () => {
      render(<App />)
      await interact("click", screen.getAllByRole("button", { name: "New terminal" })[0]!)
      expect(screen.getByRole("heading", { name: "Terminal 07" })).toBeVisible()
      expect(screen.getByRole("textbox", { name: "Command for Terminal 07" })).toHaveValue("")
      expect(screen.getByText("7 terminals", { selector: ".app-footer span" })).toBeVisible()
    })
  })
  context("when managing terminal tabs", () => {
    it("renames a session across layouts and cancels an unfinished rename", async () => {
      render(<App />)
      await interact(
        "click",
        screen.getByRole("button", { name: "Rename Checkout implementation" }),
      )
      const input = screen.getByRole("textbox", { name: "Rename Checkout implementation" })
      await interact("change", input, { target: { value: "  Local shell  " } })
      await interact("keyDown", input, { key: "Enter" })
      expect(screen.getByRole("heading", { name: "Local shell" })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: "Rename Local shell" }))
      const edit = screen.getByRole("textbox", { name: "Rename Local shell" })
      await interact("change", edit, { target: { value: "Discard this" } })
      await interact("keyDown", edit, { key: "Escape" })
      expect(screen.getByRole("button", { name: "Select Local shell" })).toBeVisible()
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      expect(screen.getByRole("region", { name: "Local shell terminal" })).toBeVisible()
    })

    it("closes an active terminal, selects its neighbor, and creates a distinct session", async () => {
      render(<App />)
      await interact(
        "click",
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
      await interact("click", screen.getByRole("button", { name: "New terminal" }))
      expect(screen.getByRole("heading", { name: "Terminal 07" })).toBeVisible()
      expect(screen.getByRole("button", { name: "Select Build" })).toBeVisible()
      expect(screen.getByText("6 terminals", { selector: ".app-footer span" })).toBeVisible()
    })

    it("shows an empty workspace after the last close and can start again", async () => {
      render(<App />)
      for (const name of [
        "Checkout implementation",
        "Dev server",
        "Tests",
        "Checkout review",
        "Runtime",
        "Build",
      ]) {
        // eslint-disable-next-line no-await-in-loop -- Each close changes the next active terminal.
        await interact(
          "click",
          within(screen.getByRole("complementary")).getByRole("button", { name: `Close ${name}` }),
        )
      }
      expect(screen.getByRole("heading", { name: "No terminals open" })).toBeVisible()
      expect(screen.getByText("0 terminals", { selector: ".app-footer span" })).toBeVisible()
      await interact("click", screen.getAllByRole("button", { name: "New terminal" })[0]!)
      expect(screen.getByRole("region", { name: "Terminal 07 terminal" })).toBeVisible()
    })
  })
})
