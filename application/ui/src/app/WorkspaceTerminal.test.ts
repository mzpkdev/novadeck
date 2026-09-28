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
    const TerminalSurface = ({ terminal, renderCard }: TerminalSurfaceProps): React.JSX.Element => {
      useEffect(() => {
        lifecycle.mounted += 1
        return () => {
          lifecycle.unmounted += 1
        }
      }, [])
      const surface = createElement(
        "div",
        { "data-terminal-content": "" },
        createElement("input", {
          "data-terminal-input": "",
          "aria-label": `Input for ${terminal.name}`,
        }),
      )
      return createElement(Fragment, null, renderCard ? renderCard(surface) : surface)
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
  const process = (kind: "shell" | "claude" | "codex" | "git") =>
    act(() => {
      services.workspace.dispatch({
        type: "terminal/process",
        target,
        terminalId: id,
        process: { process: kind, kind },
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

const visibleCard = (container: HTMLElement): HTMLElement => {
  const cards = [...container.querySelectorAll<HTMLElement>("[data-terminal]")].filter(
    (card) =>
      getComputedStyle(card).display !== "none" &&
      getComputedStyle(card.parentElement!).display !== "none",
  )
  expect(cards).toHaveLength(1)
  return cards[0]!
}

describe("process window cards", () => {
  context("when the foreground process changes", () => {
    it("shows independent Claude and Codex cards and returns to the terminal without remounting its controller", async () => {
      const page = await open("02")
      try {
        const terminal = visibleCard(page.container)
        expect(terminal.querySelector("[data-terminal-input]")).not.toBeNull()

        page.process("claude")
        expect(visibleCard(page.container).dataset.processCard).toBe("claude")
        expect(visibleCard(page.container).querySelector("[data-terminal-input]")).not.toBeNull()
        expect(visibleCard(page.container).querySelector(".terminal-header")).not.toBeNull()

        page.process("codex")
        expect(visibleCard(page.container).dataset.processCard).toBe("codex")
        expect(visibleCard(page.container).querySelector("[data-terminal-input]")).not.toBeNull()

        page.process("shell")
        expect(visibleCard(page.container).dataset.processCard).toBeUndefined()
        expect(visibleCard(page.container).querySelector("[data-terminal-input]")).not.toBeNull()
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })

    it("keeps non-agent foreground processes on the regular terminal card", async () => {
      const page = await open("02")
      try {
        const terminal = visibleCard(page.container)
        page.process("git")
        expect(visibleCard(page.container)).toBe(terminal)
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })

    it("shows the regular terminal again when an agent session fails", async () => {
      const page = await open("02")
      try {
        page.process("claude")
        expect(visibleCard(page.container).dataset.processCard).toBe("claude")

        page.fail()
        expect(visibleCard(page.container).dataset.processCard).toBeUndefined()
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })

    it("shows the terminal during a fresh shell startup even while the last process kind is an agent", async () => {
      const page = await open("02")
      try {
        page.process("codex")
        expect(visibleCard(page.container).dataset.processCard).toBe("codex")

        page.start()
        expect(visibleCard(page.container).dataset.processCard).toBeUndefined()
        expect(page.lifecycle).toEqual({ mounted: 1, unmounted: 0 })
      } finally {
        page.unmount()
      }
    })
  })
})
