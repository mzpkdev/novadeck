import { act, createElement, Fragment, useEffect, type ComponentProps } from "react"
import { HashRouter } from "react-router"

import type { CreateBackend, TerminalSurfaceProps } from "../backend/port"
import { context, describe, expect, it } from "../test"
import { render } from "../test/render"
import { selectBackend } from "./backend"
import {
  useWorkspaceServices,
  useWorkspaceState,
  type WorkspaceServices,
} from "./controller/context"
import { currentState } from "./selectors"
import { WorkspaceProvider } from "./WorkspaceProvider"
import { WorkspaceTerminal } from "./WorkspaceTerminal"

const Subject = ({ id }: { id: string }): React.JSX.Element => {
  const terminal = useWorkspaceState((workspace) =>
    currentState(workspace).roster.terminals.find((item) => item.id === id),
  )
  if (!terminal) throw new Error(`Missing terminal ${id}`)
  return createElement(WorkspaceTerminal, { terminal, controls: {} })
}

const Grab = ({ found }: { found: (services: WorkspaceServices) => void }): null => {
  const services = useWorkspaceServices()
  useEffect(() => found(services), [found, services])
  return null
}

const open = async (id: string) => {
  window.location.hash = "#/projects/storefront/sessions/initial/focus"
  const lifecycle = { mounted: 0, unmounted: 0 }
  const createBackend: CreateBackend = () => {
    if (!("createBackend" in selectBackend)) throw new Error("Tests expect a ready backend")
    const backend = selectBackend.createBackend()
    const TerminalSurface = ({
      terminal,
      renderWindow,
    }: TerminalSurfaceProps): React.JSX.Element => {
      useEffect(() => {
        lifecycle.mounted += 1
        return () => {
          lifecycle.unmounted += 1
        }
      }, [])
      const content = createElement(
        "div",
        { "data-terminal-content": "" },
        createElement("input", {
          "data-terminal-input": "",
          "aria-label": `Input for ${terminal.name}`,
        }),
      )
      return createElement(Fragment, null, renderWindow(content))
    }
    return { ...backend, TerminalSurface }
  }
  let found!: (services: WorkspaceServices) => void
  const handedOver = new Promise<WorkspaceServices>((resolve) => {
    found = resolve
  })
  const page = render(
    createElement(
      HashRouter,
      null,
      createElement(
        WorkspaceProvider,
        { createBackend } as ComponentProps<typeof WorkspaceProvider>,
        createElement(Grab, { found }),
        createElement(Subject, { id }),
      ),
    ),
  )
  const services = await act(() => handedOver)
  const target = { projectId: "storefront", workspaceSessionId: "initial" }
  const process = (program: string) =>
    act(() => {
      services.workspace.dispatch({
        type: "terminal/process",
        target,
        terminalId: id,
        process: program,
      })
    })
  const fail = () =>
    act(() => {
      services.workspace.dispatch({
        type: "terminal/status",
        target,
        terminalId: id,
        status: { state: "failed", message: "Could not start" },
      })
    })
  const start = () =>
    act(() => {
      services.workspace.dispatch({
        type: "terminal/status",
        target,
        terminalId: id,
        status: { state: "starting" },
      })
    })
  return { ...page, lifecycle, process, fail, start }
}

const visibleWindow = (container: HTMLElement): HTMLElement => {
  const windows = [...container.querySelectorAll<HTMLElement>("[data-terminal]")].filter(
    (window) =>
      getComputedStyle(window).display !== "none" &&
      getComputedStyle(window.parentElement!).display !== "none",
  )
  expect(windows).toHaveLength(1)
  return windows[0]!
}

// The header icon, which the window's program picks.
const headerIcon = (window: HTMLElement): string | null | undefined =>
  window.querySelector('button[aria-label="Switch terminal"] svg')?.getAttribute("class")

describe("process windows", () => {
  context("when the foreground process changes", () => {
    it("shows Claude and Codex in their own windows and returns to the terminal without remounting the surface", async () => {
      const page = await open("02")
      try {
        const terminal = visibleWindow(page.container)
        expect(terminal.querySelector("[data-terminal-input]")).not.toBeNull()

        page.process("claude")
        expect(visibleWindow(page.container).dataset.processWindow).toBe("claude")
        expect(visibleWindow(page.container).querySelector("[data-terminal-input]")).not.toBeNull()
        expect(visibleWindow(page.container).querySelector(".terminal-header")).not.toBeNull()
        expect(headerIcon(visibleWindow(page.container))).toContain("lucide-claude")

        page.process("codex")
        expect(visibleWindow(page.container).dataset.processWindow).toBe("codex")
        expect(visibleWindow(page.container).querySelector("[data-terminal-input]")).not.toBeNull()

        page.process("zsh")
        expect(visibleWindow(page.container).dataset.processWindow).toBeUndefined()
        expect(headerIcon(visibleWindow(page.container))).toContain("lucide-terminal")
        expect(visibleWindow(page.container).querySelector("[data-terminal-input]")).not.toBeNull()
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })

    it("keeps other programs in the plain terminal window", async () => {
      const page = await open("02")
      try {
        const terminal = visibleWindow(page.container)
        page.process("vim")
        expect(visibleWindow(page.container)).toBe(terminal)
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })

    it("shows the regular terminal again when an agent session fails", async () => {
      const page = await open("02")
      try {
        page.process("claude")
        expect(visibleWindow(page.container).dataset.processWindow).toBe("claude")

        page.fail()
        expect(visibleWindow(page.container).dataset.processWindow).toBeUndefined()
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })

    it("shows the terminal during a fresh shell startup even while the last program is an agent", async () => {
      const page = await open("02")
      try {
        page.process("codex")
        expect(visibleWindow(page.container).dataset.processWindow).toBe("codex")

        page.start()
        expect(visibleWindow(page.container).dataset.processWindow).toBeUndefined()
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })
  })
})
