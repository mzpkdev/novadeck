import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, vi } from "vitest"

import { context, describe, expect, it } from "../test"
import { App } from "./App"

const interact = async (
  type: "click" | "doubleClick" | "change" | "keyDown" | "keyUp" | "submit",
  element: Element | Window,
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

const expectPlacement = (): void => {
  expect(screen.getByRole("button", { name: "New terminal" })).toHaveAttribute(
    "data-placing",
    "true",
  )
  expect(
    screen.getByRole("button", { name: "Select Terminal 07" }).closest(".session-tab"),
  ).toHaveAttribute("data-placing", "true")
  expect(screen.queryByRole("region", { name: "Terminal 07 terminal" })).not.toBeInTheDocument()
}

describe("novadeck. workspace", () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, "", "/")
  })
  context("when using workspace shortcuts", () => {
    for (const view of ["Focus", "Grid", "Canvas"]) {
      for (const panel of ["Terminals", "Sessions"]) {
        it(`deselects before hiding the ${panel} sidebar with Escape in ${view}`, async () => {
          render(<App />)
          await interact("click", screen.getByRole("radio", { name: view }))
          await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
          if (panel === "Sessions")
            await interact("click", screen.getByRole("radio", { name: panel }))
          const command = screen.getByRole("textbox", { name: "Command for Dev server" })
          command.focus()
          await interact("keyDown", command, { key: "Escape" })
          expect(new URLSearchParams(window.location.hash.split("?")[1]).get("terminal")).toBe("")
          expect(screen.getByRole("complementary")).toBeVisible()
          expect(command).not.toHaveFocus()
          if (view === "Focus")
            expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
          expect(
            document.querySelector(".grid-terminal.selected, .canvas-node.selected"),
          ).toBeNull()
          await interact("keyDown", window, { key: "Escape", repeat: true })
          expect(screen.getByRole("complementary")).toBeVisible()
          await interact("keyDown", document.activeElement!, { key: "Escape" })
          expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
          const route = window.location.hash
          await interact("keyDown", window, { key: "Escape" })
          expect(window.location.hash).toBe(route)
          expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
        })
      }
    }

    it("reactivates the displayed Focus terminal when its input receives focus", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      await interact("keyDown", window, { key: "Escape" })
      const command = screen.getByRole("textbox", { name: "Command for Dev server" })
      await act(async () => command.focus())
      expect(window.location.hash).toContain("terminal=02")
      expect(screen.getByRole("button", { name: "Select Dev server" })).toHaveAttribute(
        "aria-current",
        "true",
      )
    })

    it("leaves selection and the sidebar intact when Escape dismisses the recent switcher", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact("keyDown", window, { key: "Tab", ctrlKey: true })
      await interact("keyDown", window, { key: "Escape" })
      expect(screen.queryByRole("listbox", { name: "Recent terminals" })).not.toBeInTheDocument()
      expect(window.location.hash).toContain("terminal=01")
      expect(screen.getByRole("complementary")).toBeVisible()
    })

    for (const platform of ["MacIntel", "Win32", "Linux x86_64"]) {
      it(`creates a session and shows its shortcut cues on ${platform}`, async () => {
        vi.spyOn(navigator, "platform", "get").mockReturnValue(platform)
        const mac = platform === "MacIntel"
        const shortcut = { key: "N", ctrlKey: !mac, metaKey: mac, shiftKey: true }
        render(<App />)
        const original = window.location.hash
        await interact("click", screen.getByRole("radio", { name: "Terminals" }))
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
        const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
        await interact("keyDown", command, { ...shortcut, shiftKey: false })
        expect(screen.getByRole("heading", { name: "Checkout implementation" })).toBeVisible()
        await interact("keyDown", command, shortcut)
        expect(screen.getByRole("heading", { name: "No terminals open" })).toBeVisible()
        expect(screen.getByRole("complementary", { name: "Workspace sessions" })).toBeVisible()
        expect(window.location.hash).not.toBe(original)
        expect(window.location.hash).toContain("/projects/storefront/")
        const list = screen.getByRole("list", { name: "Saved sessions" })
        expect(within(list).getAllByRole("listitem")).toHaveLength(2)
        expect(within(list).getByRole("button", { current: true })).toHaveTextContent("0 terminals")
        expect(screen.getByRole("button", { name: "New session" })).toHaveTextContent(
          `${mac ? "⌘" : "Ctrl"} Shift N`,
        )
        await interact("keyDown", window, { ...shortcut, repeat: true })
        expect(within(list).getAllByRole("listitem")).toHaveLength(2)
        await interact("keyDown", window, { key: ",", ctrlKey: !mac, metaKey: mac })
        const preferences = screen.getByRole("dialog", { name: "Preferences" })
        await interact("click", within(preferences).getByRole("tab", { name: "Shortcuts" }))
        expect(within(preferences).getByText("New session").parentElement).toHaveTextContent(
          `${mac ? "⌘" : "Ctrl"}ShiftN`,
        )
        const route = window.location.hash
        await interact("keyDown", window, shortcut)
        expect(window.location.hash).toBe(route)
      })
    }

    for (const platform of ["MacIntel", "Win32", "Linux x86_64"]) {
      it(`toggles sidebar panels and lists their shortcuts on ${platform}`, async () => {
        vi.spyOn(navigator, "platform", "get").mockReturnValue(platform)
        const mac = platform === "MacIntel"
        const modifiers = { ctrlKey: !mac, metaKey: mac, shiftKey: true }
        const terminalsKey = { key: "!", code: "Digit1", ...modifiers }
        const sessionsKey = { key: "@", code: "Digit2", ...modifiers }
        render(<App />)
        const terminals = screen.getByRole("radio", { name: "Terminals" })
        const sessions = screen.getByRole("radio", { name: "Sessions" })
        const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
        await interact("keyDown", command, terminalsKey)
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
        await interact("keyDown", window, { ...terminalsKey, repeat: true })
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
        await interact("keyDown", window, terminalsKey)
        expect(terminals).toHaveAttribute("aria-checked", "true")
        await interact("keyDown", window, sessionsKey)
        expect(sessions).toHaveAttribute("aria-checked", "true")
        expect(terminals).toHaveAttribute("aria-checked", "false")
        await interact("keyDown", window, sessionsKey)
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
        await interact("keyDown", window, sessionsKey)
        expect(sessions).toHaveAttribute("aria-checked", "true")
        await interact("keyDown", window, terminalsKey)
        expect(terminals).toHaveAttribute("aria-checked", "true")
        await interact("keyDown", window, { key: ",", ctrlKey: !mac, metaKey: mac })
        const preferences = screen.getByRole("dialog", { name: "Preferences" })
        await interact("click", within(preferences).getByRole("tab", { name: "Shortcuts" }))
        expect(
          within(preferences).getByText("Toggle terminal sidebar").parentElement,
        ).toHaveTextContent(`${mac ? "⌘" : "Ctrl"}Shift1`)
        expect(
          within(preferences).getByText("Toggle session sidebar").parentElement,
        ).toHaveTextContent(`${mac ? "⌘" : "Ctrl"}Shift2`)
        const route = window.location.hash
        await interact("keyDown", window, sessionsKey)
        expect(window.location.hash).toBe(route)
      })
    }

    it("cycles view modes in both directions and preserves terminal selection", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      await interact("keyDown", window, { key: "ArrowRight" })
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      await interact("keyDown", window, { key: "ArrowRight" })
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      const node = document.querySelector<HTMLElement>('.react-flow__node[data-id="02"]')!
      await interact("keyDown", node, { key: "ArrowRight" })
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
      await interact("keyDown", window, { key: "ArrowLeft" })
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      expect(window.location.hash).toContain("terminal=02")
    })

    it("skips disabled views when using Left and Right", async () => {
      localStorage.setItem(
        "novadeck.preferences",
        JSON.stringify({ enabledViews: ["focus", "canvas"] }),
      )
      render(<App />)
      await interact("keyDown", window, { key: "ArrowRight" })
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      await interact("keyDown", window, { key: "ArrowLeft" })
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
    })

    for (const view of ["Focus", "Grid", "Canvas"]) {
      it(`navigates terminal tabs after clicking the ${view} mode control`, async () => {
        render(<App />)
        const mode = screen.getByRole("radio", { name: view })
        await interact("click", mode)
        await act(async () => mode.focus())
        expect(mode).toHaveFocus()
        await interact("keyDown", mode, { key: "ArrowDown" })
        expect(screen.getByRole("region", { name: `${view.toLowerCase()} view` })).toBeVisible()
        const tab = screen.getByRole("button", { name: "Select Dev server" })
        expect(tab).toHaveAttribute("aria-current", "true")
        expect(tab).toHaveFocus()
        await interact("keyDown", document.activeElement!, { key: "ArrowDown" })
        const next = screen.getByRole("button", { name: "Select Tests" })
        expect(next).toHaveAttribute("aria-current", "true")
        expect(next).toHaveFocus()
        expect(tab).not.toHaveFocus()
        await interact("keyDown", document.activeElement!, { key: "ArrowUp" })
        expect(tab).toHaveAttribute("aria-current", "true")
        expect(tab).toHaveFocus()
        expect(mode).toBeChecked()
      })
    }

    it("keeps Left/Right view switching available from the focused mode control", async () => {
      render(<App />)
      const mode = screen.getByRole("radio", { name: "Grid" })
      await interact("click", mode)
      await act(async () => mode.focus())
      await interact("keyDown", mode, { key: "ArrowRight" })
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      await interact("keyDown", mode, { key: "ArrowLeft" })
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
      expect(window.location.hash).toContain("terminal=01")
    })

    for (const view of ["Focus", "Grid", "Canvas"]) {
      it(`selects terminals in sidebar order with arrows in ${view}`, async () => {
        render(<App />)
        await interact("click", screen.getByRole("radio", { name: view }))
        const first = screen.getByRole("button", { name: "Select Checkout implementation" })
        const last = screen.getByRole("button", { name: "Select Build" })
        await interact("keyDown", first, { key: "ArrowDown" })
        expect(window.location.hash).toContain("terminal=02")
        await interact("keyDown", first, { key: "ArrowUp" })
        expect(window.location.hash).toContain("terminal=01")
        await interact("keyDown", first, { key: "ArrowUp" })
        expect(last).toHaveAttribute("aria-current", "true")
        await interact("keyDown", first, { key: "ArrowDown" })
        expect(window.location.hash).toContain("terminal=01")
      })
    }

    it("leaves arrows in command inputs and dialogs alone", async () => {
      render(<App />)
      const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      const route = window.location.hash
      await interact("keyDown", command, { key: "ArrowDown" })
      expect(window.location.hash).toBe(route)
      await interact("keyDown", command, { key: "ArrowRight" })
      expect(window.location.hash).toBe(route)
      await interact("keyDown", window, { key: "k", ctrlKey: true, shiftKey: true })
      const searchRoute = window.location.hash
      await interact("keyDown", window, { key: "ArrowDown" })
      expect(window.location.hash).toBe(searchRoute)
      await interact("keyDown", window, { key: "ArrowLeft" })
      expect(window.location.hash).toBe(searchRoute)
    })

    it("selects from a focused Canvas node without moving it and disables camera arrows", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      const node = document.querySelector<HTMLElement>('.react-flow__node[data-id="01"]')!
      const position = node.style.transform
      await interact("keyDown", node, { key: "ArrowDown" })
      expect(window.location.hash).toContain("terminal=02")
      expect(node.style.transform).toBe(position)
      const viewport = document.querySelector<HTMLElement>(".react-flow__viewport")!
      const camera = viewport.style.transform
      await act(async () => {
        for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
          fireEvent.keyDown(screen.getByLabelText("Terminal canvas"), { key, shiftKey: true })
          expect(viewport.style.transform).toBe(camera)
        }
      })
    })

    it("keeps Ctrl+K available to the terminal and opens search with Ctrl+Shift+K", async () => {
      render(<App />)
      const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      await interact("keyDown", command, { key: "k", ctrlKey: true })
      expect(screen.queryByRole("dialog", { name: "Find a terminal" })).not.toBeInTheDocument()
      await interact("keyDown", command, { key: "k", ctrlKey: true, shiftKey: true })
      expect(screen.getByRole("dialog", { name: "Find a terminal" })).toBeVisible()
    })

    it("cycles a stable recent list while Ctrl is held and commits on release", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      await interact("click", screen.getByRole("button", { name: "Select Runtime" }))
      await interact("keyDown", window, { key: "Tab", ctrlKey: true })
      expect(screen.getByRole("listbox", { name: "Recent terminals" })).toBeVisible()
      expect(screen.getByRole("option", { name: "Dev server" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeVisible()
      await interact("keyDown", window, { key: "Tab", ctrlKey: true })
      expect(screen.getByRole("option", { name: "Checkout implementation" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      await interact("keyDown", window, { key: "Tab", ctrlKey: true, shiftKey: true })
      expect(screen.getByRole("option", { name: "Dev server" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      await interact("keyUp", window, { key: "Control" })
      expect(screen.queryByRole("listbox", { name: "Recent terminals" })).not.toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "Dev server" })).toBeVisible()
    })

    it("cycles with arrows without moving the focused Canvas terminal", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      const node = document.querySelector<HTMLElement>('.react-flow__node[data-id="01"]')!
      node.focus()
      const position = node.style.transform
      await interact("keyDown", node, { key: "Tab", ctrlKey: true })
      await interact("keyDown", node, { key: "ArrowUp", ctrlKey: true })
      expect(screen.getByRole("option", { name: "Checkout implementation" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      await interact("keyDown", node, { key: "ArrowUp", ctrlKey: true })
      expect(screen.getByRole("option", { name: "Build" })).toHaveAttribute("aria-selected", "true")
      await interact("keyDown", node, { key: "ArrowDown", ctrlKey: true })
      expect(screen.getByRole("option", { name: "Checkout implementation" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
      expect(node.style.transform).toBe(position)
      await interact("keyUp", node, { key: "Control" })
      expect(screen.queryByRole("listbox", { name: "Recent terminals" })).not.toBeInTheDocument()
    })

    it("focuses the chosen terminal input when switching from a command input", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      const command = screen.getByRole("textbox", { name: "Command for Dev server" })
      command.focus()
      await interact("keyDown", command, { key: "Tab", ctrlKey: true })
      await interact("keyUp", command, { key: "Control" })
      expect(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
      ).toHaveFocus()
    })

    it("clears the recent switcher when search opens before Ctrl is released", async () => {
      render(<App />)
      await interact("keyDown", window, { key: "Tab", ctrlKey: true })
      expect(screen.getByRole("listbox", { name: "Recent terminals" })).toBeVisible()
      await interact("keyDown", window, { key: "k", ctrlKey: true, shiftKey: true })
      await interact("keyUp", window, { key: "Control" })
      expect(screen.getByRole("dialog", { name: "Find a terminal" })).toBeVisible()
      await interact("click", screen.getByRole("button", { name: "Close search" }))
      expect(screen.queryByRole("listbox", { name: "Recent terminals" })).not.toBeInTheDocument()
    })

    it("starts with the most recent terminal after the Canvas selection is cleared", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      await interact("click", document.querySelector(".react-flow__pane")!)
      await interact("keyDown", window, { key: "Tab", ctrlKey: true })
      expect(screen.getByRole("option", { name: "Dev server" })).toHaveAttribute(
        "aria-selected",
        "true",
      )
    })

    it("toggles Focus and restores the previous windowed layout", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      await interact("keyDown", window, { key: "Enter", ctrlKey: true, shiftKey: true })
      expect(document.querySelector('[aria-label="focus view"]')).toBeVisible()
      await interact("keyDown", window, { key: "Enter", ctrlKey: true, shiftKey: true })
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
    })

    it("keeps command focus through Focus toggle and ignores held-key repeats", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      const command = screen.getByRole("textbox", { name: "Command for Checkout implementation" })
      command.focus()
      await interact("keyDown", command, { key: "Enter", ctrlKey: true, shiftKey: true })
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
      expect(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
      ).toHaveFocus()
      await interact("keyDown", window, {
        key: "Enter",
        ctrlKey: true,
        shiftKey: true,
        repeat: true,
      })
      expect(screen.getByRole("region", { name: "focus view" })).toBeVisible()
    })

    it("lets modified Enter toggle Focus from the sidebar separator without resizing it", async () => {
      render(<App />)
      const separator = screen.getByRole("separator", { name: "Resize sidebar" })
      const width = separator.getAttribute("aria-valuenow")
      separator.focus()
      await interact("keyDown", separator, { key: "Enter", ctrlKey: true, shiftKey: true })
      expect(separator).toHaveAttribute("aria-valuenow", width)
      expect(screen.getByRole("region", { name: "grid view" })).toBeVisible()
    })

    it("creates and focuses a terminal immediately in Focus", async () => {
      render(<App />)
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      await interact("click", screen.getByRole("radio", { name: "Terminals" }))
      await interact("keyDown", window, { key: "t", ctrlKey: true, shiftKey: true })
      expect(screen.getByRole("complementary", { name: "Terminal sessions" })).toBeVisible()
      expect(screen.getByRole("button", { name: "New terminal" })).toHaveAttribute(
        "data-placing",
        "false",
      )
      expect(screen.getByRole("textbox", { name: "Command for Terminal 07" })).toHaveFocus()
      expect(screen.getByRole("region", { name: "Terminal 07 terminal" })).toBeVisible()
      await interact("keyDown", window, { key: "t", ctrlKey: true, shiftKey: true, repeat: true })
      expect(screen.queryByRole("button", { name: "Select Terminal 08" })).not.toBeInTheDocument()
    })

    it("leaves creation and layout shortcuts inactive in Preferences", async () => {
      render(<App />)
      await interact("keyDown", window, { key: ",", ctrlKey: true })
      expect(screen.getByRole("dialog", { name: "Preferences" })).toBeVisible()
      await interact("keyDown", window, { key: "t", ctrlKey: true, shiftKey: true })
      await interact("keyDown", window, { key: "Enter", ctrlKey: true, shiftKey: true })
      expect(screen.getByRole("dialog", { name: "Preferences" })).toBeVisible()
      expect(screen.queryByRole("button", { name: "Select Terminal 07" })).not.toBeInTheDocument()
      expect(document.querySelector('[aria-label="focus view"]')).toBeVisible()
    })

    it("uses Command shortcuts and lists their Mac bindings", async () => {
      const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel")
      try {
        render(<App />)
        await interact("keyDown", window, { key: "k", ctrlKey: true, shiftKey: true })
        expect(screen.queryByRole("dialog", { name: "Find a terminal" })).not.toBeInTheDocument()
        await interact("keyDown", window, { key: "t", metaKey: true })
        expect(screen.getByRole("textbox", { name: "Command for Terminal 07" })).toHaveFocus()
        await interact("keyDown", window, { key: "k", metaKey: true })
        expect(screen.getByRole("dialog", { name: "Find a terminal" })).toBeVisible()
        await interact("keyDown", window, { key: ",", metaKey: true })
        const preferences = screen.getByRole("dialog", { name: "Preferences" })
        await interact("click", within(preferences).getByRole("tab", { name: "Shortcuts" }))
        const search = within(preferences).getByText("Find a terminal").parentElement!
        const create = within(preferences).getByText("New terminal").parentElement!
        expect(search).toHaveTextContent("⌘K")
        expect(create).toHaveTextContent("⌘T")
      } finally {
        platform.mockRestore()
      }
    })
  })
  context("when placing new terminals", () => {
    for (const view of ["Grid", "Canvas"]) {
      it(`starts ghost placement from the keyboard in ${view} and cancels with Escape`, async () => {
        render(<App />)
        await interact("click", screen.getByRole("radio", { name: view }))
        await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
        await interact(
          "click",
          screen.getByRole("radio", { name: view === "Grid" ? "Terminals" : "Sessions" }),
        )
        const command = screen.getByRole("textbox", { name: "Command for Dev server" })
        command.focus()
        await interact("keyDown", command, { key: "t", ctrlKey: true, shiftKey: true })
        expect(screen.getByRole("complementary", { name: "Terminal sessions" })).toBeVisible()
        expectPlacement()
        expect(
          screen.queryByRole("textbox", { name: "Command for Terminal 07" }),
        ).not.toBeInTheDocument()
        await interact("keyDown", window, { key: "t", ctrlKey: true, shiftKey: true, repeat: true })
        expect(screen.queryByRole("button", { name: "Select Terminal 08" })).not.toBeInTheDocument()
        await interact("keyDown", window, { key: "Escape" })
        expect(screen.queryByRole("button", { name: "Select Terminal 07" })).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Select Dev server" })).toHaveAttribute(
          "aria-current",
          "true",
        )
      })

      it(`keeps placement active when switching from ${view} to the other layout and back`, async () => {
        render(<App />)
        await interact("click", screen.getByRole("radio", { name: view }))
        await interact("click", screen.getByRole("button", { name: "New terminal" }))
        const other = view === "Grid" ? "Canvas" : "Grid"
        await interact("click", screen.getByRole("radio", { name: other }))
        expectPlacement()
        await interact("click", screen.getByRole("radio", { name: view }))
        expectPlacement()
        await interact("keyDown", document.body, { key: "Escape" })
        expect(screen.queryByRole("button", { name: "Select Terminal 07" })).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "New terminal" })).toHaveAttribute(
          "data-placing",
          "false",
        )
      })
      it(`cancels ${view} placement with Escape and restores the previous terminal`, async () => {
        render(<App />)
        await interact("click", screen.getByRole("radio", { name: view }))
        await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
        const create = screen.getByRole("button", { name: "New terminal" })
        await interact("click", create)
        expect(create).toHaveAttribute("data-placing", "true")
        expect(
          screen.getByRole("button", { name: "Select Terminal 07" }).closest(".session-tab"),
        ).toHaveAttribute("data-placing", "true")
        await interact("keyDown", document.body, { key: "Escape" })
        expect(screen.queryByRole("button", { name: "Select Terminal 07" })).not.toBeInTheDocument()
        expect(create).toHaveAttribute("data-placing", "false")
        expect(screen.getByRole("button", { name: "Select Dev server" })).toHaveAttribute(
          "aria-current",
          "true",
        )
        expect(screen.getByText("6 terminals", { selector: ".app-footer span" })).toBeVisible()
        await interact("click", create)
        await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
        await interact("keyDown", document.body, { key: "Escape" })
        expect(screen.getByRole("button", { name: "Select Terminal 08" })).toBeInTheDocument()
        expect(create).toHaveAttribute("data-placing", "false")
      })
      it(`creates the ${view} sidebar tab immediately and automatically places it on navigation`, async () => {
        render(<App />)
        await interact("click", screen.getByRole("radio", { name: view }))
        await interact("click", screen.getByRole("button", { name: "New terminal" }))
        expect(screen.getByRole("button", { name: "Select Terminal 07" })).toHaveAttribute(
          "aria-current",
          "true",
        )
        expect(screen.getByText("7 terminals", { selector: ".app-footer span" })).toBeVisible()
        expect(
          screen.queryByRole("region", { name: "Terminal 07 terminal" }),
        ).not.toBeInTheDocument()
        await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
        expect(screen.getByRole("region", { name: "Terminal 07 terminal" })).toBeInTheDocument()
        await interact("click", screen.getByRole("button", { name: "New terminal" }))
        await interact("click", screen.getByRole("radio", { name: "Focus" }))
        expect(screen.getByRole("region", { name: "Terminal 08 terminal" })).toBeVisible()
        await interact("click", screen.getByRole("radio", { name: view }))
        expect(screen.getByRole("region", { name: "Terminal 08 terminal" })).toBeInTheDocument()
      })
    }
  })
  context("when hiding terminals from shared layouts", () => {
    it("previews the active hidden terminal without changing its visibility in Grid or Canvas", async () => {
      render(<App />)
      await interact(
        "change",
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
        { target: { value: "unfinished command" } },
      )
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact(
        "click",
        screen.getByRole("button", { name: "Hide Checkout implementation in Grid and Canvas" }),
      )
      expect(
        screen
          .getByRole("region", { name: "Checkout implementation terminal" })
          .closest(".grid-terminal"),
      ).toHaveAttribute("data-preview", "true")
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      expect(
        screen.queryByRole("region", { name: "Checkout implementation terminal" }),
      ).not.toBeInTheDocument()
      const tab = screen.getByRole("button", { name: "Select Checkout implementation (hidden)" })
      expect(tab).not.toHaveAttribute("aria-current")
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      expect(
        screen.queryByRole("region", { name: "Checkout implementation terminal" }),
      ).not.toBeInTheDocument()
      await interact(
        "click",
        screen.getByRole("button", { name: "Select Checkout implementation (hidden)" }),
      )
      expect(
        screen.getByRole("textbox", { name: "Command for Checkout implementation" }),
      ).toHaveValue("unfinished command")
      expect(
        screen.getByRole("button", { name: "Show Checkout implementation in Grid and Canvas" }),
      ).toBeEnabled()
      expect(
        screen
          .getByRole("region", { name: "Checkout implementation terminal" })
          .closest(".canvas-node"),
      ).toHaveAttribute("data-preview", "true")
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      expect(
        screen.queryByRole("region", { name: "Checkout implementation terminal" }),
      ).not.toBeInTheDocument()
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      await interact(
        "click",
        screen.getByRole("button", { name: "Select Checkout implementation (hidden)" }),
      )
      expect(
        screen
          .getByRole("region", { name: "Checkout implementation terminal" })
          .closest(".grid-terminal"),
      ).toHaveAttribute("data-preview", "true")
      await interact(
        "click",
        screen.getByRole("button", { name: "Show Checkout implementation in Grid and Canvas" }),
      )
      expect(
        screen
          .getByRole("region", { name: "Checkout implementation terminal" })
          .closest(".grid-terminal"),
      ).toHaveAttribute("data-preview", "false")
      await interact("click", screen.getByRole("button", { name: "Select Dev server" }))
      expect(screen.getByRole("region", { name: "Checkout implementation terminal" })).toBeVisible()
    })

    it("toggles visibility without selecting a different tab and still allows Focus access", async () => {
      render(<App />)
      await interact(
        "click",
        screen.getByRole("button", { name: "Hide Dev server in Grid and Canvas" }),
      )
      expect(
        screen.getByRole("button", { name: "Select Checkout implementation" }),
      ).toHaveAttribute("aria-current", "true")
      await interact(
        "click",
        screen.getByRole("button", { name: "Show Dev server in Grid and Canvas" }),
      )
      expect(
        screen.getByRole("button", { name: "Select Checkout implementation" }),
      ).toHaveAttribute("aria-current", "true")
      await interact(
        "click",
        screen.getByRole("button", { name: "Hide Checkout implementation in Grid and Canvas" }),
      )
      expect(screen.getByRole("region", { name: "Checkout implementation terminal" })).toBeVisible()
      await interact("click", screen.getByRole("radio", { name: "Grid" }))
      expect(
        screen
          .getByRole("region", { name: "Checkout implementation terminal" })
          .closest(".grid-terminal"),
      ).toHaveAttribute("data-preview", "true")
      await interact("click", screen.getByRole("radio", { name: "Focus" }))
      expect(screen.getByRole("region", { name: "Checkout implementation terminal" })).toBeVisible()
    })

    it("can restore all terminals after hiding every tab", async () => {
      render(<App />)
      await interact("click", screen.getByRole("radio", { name: "Canvas" }))
      await act(async () => {
        for (const button of screen.getAllByRole("button", {
          name: /^Hide .* in Grid and Canvas$/,
        }))
          fireEvent.click(button)
      })
      expect(screen.queryByText("All terminals are hidden")).not.toBeInTheDocument()
      await interact("click", document.querySelector(".react-flow__pane")!)
      expect(screen.getByText("All terminals are hidden")).toBeVisible()
      expect(screen.queryAllByRole("textbox", { name: /^Command for / })).toHaveLength(0)
      await interact("click", screen.getByRole("button", { name: "Show all terminals" }))
      expect(screen.queryByText("All terminals are hidden")).not.toBeInTheDocument()
      expect(screen.getAllByRole("textbox", { name: /^Command for / })).toHaveLength(6)
    })
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
      await interact("keyDown", node, { key: "ArrowRight", ctrlKey: true })
      expect(node).toHaveStyle({ transform: "translate(104px,80px)" })
      await interact("keyDown", node, { key: "ArrowDown", shiftKey: true })
      expect(node).toHaveStyle({ transform: "translate(104px,176px)" })
    })
  })

  context("when toggling views from a terminal header", () => {
    for (const view of ["grid", "canvas"] as const) {
      it(`returns to ${view} and uses its header action without changing the terminal`, async () => {
        localStorage.setItem("novadeck.windowed-view", view)
        const app = render(<App />)
        const header = (): HTMLElement =>
          app.getByRole("heading", { name: "Checkout implementation" }).closest("header")!
        await interact("doubleClick", header())
        expect(screen.getByRole("region", { name: `${view} view` })).toBeVisible()
        await interact("doubleClick", header())
        expect(
          screen.getByRole("region", { name: `${view === "canvas" ? "canvas" : "focus"} view` }),
        ).toBeVisible()
        expect(screen.getByRole("heading", { name: "Checkout implementation" })).toBeVisible()
      })
    }

    it("flies to an inactive minimized Canvas terminal even when Focus is disabled", async () => {
      localStorage.setItem("novadeck.preferences", JSON.stringify({ enabledViews: ["canvas"] }))
      render(<App />)
      const terminal = screen.getByRole("region", { name: "Dev server terminal" })
      await interact("click", within(terminal).getByRole("button", { name: "Minimize Dev server" }))
      await interact(
        "doubleClick",
        within(terminal).getByRole("heading", { name: "Dev server" }).closest("header")!,
      )
      expect(screen.getByRole("region", { name: "canvas view" })).toBeVisible()
      expect(terminal.closest(".canvas-node")).toHaveClass("selected")
      expect(
        within(terminal).getByRole("textbox", { name: "Command for Dev server" }),
      ).toBeVisible()
      expect(
        within(terminal).queryByRole("button", { name: "Focus Dev server" }),
      ).not.toBeInTheDocument()
    })

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
    it("cancels renaming with the tab's close control before allowing it to close the terminal", async () => {
      render(<App />)
      const visibility = screen.getByRole("button", {
        name: "Hide Checkout implementation in Grid and Canvas",
      })
      expect(visibility).toBeEnabled()
      await interact(
        "click",
        screen.getByRole("button", { name: "Rename Checkout implementation" }),
      )
      const input = screen.getByRole("textbox", { name: "Rename Checkout implementation" })
      expect(visibility).toBeDisabled()
      await interact("change", input, { target: { value: "Discard this" } })
      await interact(
        "click",
        screen.getByRole("button", { name: "Cancel renaming Checkout implementation" }),
      )
      expect(screen.getByRole("heading", { name: "Checkout implementation" })).toBeVisible()
      expect(visibility).toBeEnabled()
      const tab = screen
        .getByRole("button", { name: "Select Checkout implementation" })
        .closest(".session-tab")!
      await interact(
        "click",
        within(tab as HTMLElement).getByRole("button", { name: "Close Checkout implementation" }),
      )
      expect(
        screen.queryByRole("button", { name: "Select Checkout implementation" }),
      ).not.toBeInTheDocument()
    })

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
