import { act, createElement, useEffect, type ComponentProps, type ComponentType } from "react"
import { HashRouter } from "react-router"
import { vi } from "vitest"

import { context, describe, expect, it } from "../test"
import { render } from "../test/render"
import { WorkspaceApp } from "./App"
import { selectBackend } from "./backend"
import { useWorkspaceServices, type WorkspaceServices } from "./controller/context"
import { WorkspaceProvider } from "./WorkspaceProvider"

// jsdom has no layout: a desktop-wide window without motion preferences, and no resizes.
vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

// Renders counted per component, and per terminal for tabs and frames. Each mock wraps
// a props-only component, which renders exactly when the section above it does.
const { renders, counted } = vi.hoisted(() => {
  const counts = new Map<string, number>()
  const wrap = async <P extends object>(
    name: string,
    Component: ComponentType<P>,
    id?: (props: P) => string,
  ) => {
    const { createElement: element } = await import("react")
    return (props: P) => {
      const key = id ? `${name} ${id(props)}` : name
      counts.set(key, (counts.get(key) ?? 0) + 1)
      return element(Component, props)
    }
  }
  return { renders: counts, counted: wrap }
})

vi.mock("../shell/WorkspaceHeader", async (original) => {
  const actual = await original<typeof import("../shell/WorkspaceHeader")>()
  return { ...actual, WorkspaceHeader: await counted("header", actual.WorkspaceHeader) }
})
vi.mock("../shell/WorkspaceSidebar", async (original) => {
  const actual = await original<typeof import("../shell/WorkspaceSidebar")>()
  return { ...actual, WorkspaceSidebar: await counted("sidebar", actual.WorkspaceSidebar) }
})
vi.mock("../shell/WorkspacePanels", async (original) => {
  const actual = await original<typeof import("../shell/WorkspacePanels")>()
  return { ...actual, WorkspacePanels: await counted("app", actual.WorkspacePanels) }
})
vi.mock("../layouts/canvas/Canvas", async (original) => {
  const actual = await original<typeof import("../layouts/canvas/Canvas")>()
  return { ...actual, Canvas: await counted("stage", actual.Canvas) }
})
vi.mock("../terminals/TerminalTab", async (original) => {
  const actual = await original<typeof import("../terminals/TerminalTab")>()
  return {
    ...actual,
    TerminalTab: await counted("tab", actual.TerminalTab, (props) => props.terminal.id),
  }
})
vi.mock("../terminals/TerminalFrame", async (original) => {
  const actual = await original<typeof import("../terminals/TerminalFrame")>()
  return {
    ...actual,
    TerminalFrame: await counted("frame", actual.TerminalFrame, (props) => props.terminal.id),
  }
})
vi.mock("../search/TerminalSearch", async (original) => {
  const actual = await original<typeof import("../search/TerminalSearch")>()
  return { ...actual, TerminalSearch: await counted("overlays", actual.TerminalSearch) }
})

// Hands the test the services the provider created.
const Grab = ({ found }: { readonly found: (services: WorkspaceServices) => void }): null => {
  const services = useWorkspaceServices()
  useEffect(() => found(services), [found, services])
  return null
}

// The whole workspace page over the default backend, with its services in reach.
const open = async () => {
  window.location.hash = "#/projects/storefront/sessions/initial/canvas?terminal=01"
  let services: WorkspaceServices | undefined
  const found = (next: WorkspaceServices): void => {
    services = next
  }
  const page = render(
    createElement(
      HashRouter,
      null,
      createElement(
        WorkspaceProvider,
        // The children follow as arguments.
        { createBackend: selectBackend } as ComponentProps<typeof WorkspaceProvider>,
        createElement(Grab, { found }),
        createElement(WorkspaceApp),
      ),
    ),
  )
  // Canvas and search load on demand.
  await act(async () => {
    await import("../layouts/canvas/Canvas")
    await import("../search/TerminalSearch")
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return { page, services: services! }
}

// What rendered while `change` ran, by component.
const rendersDuring = (change: () => void): Record<string, number> => {
  renders.clear()
  act(change)
  return Object.fromEntries(renders)
}

const firstTarget = (services: WorkspaceServices) => {
  const { activeProjectId, projects } = services.workspace.getSnapshot()
  const project = projects.find((item) => item.id === activeProjectId)!
  return { projectId: project.id, workspaceSessionId: project.activeSessionId }
}

describe("workspace render scope", () => {
  context("when the page first renders", () => {
    it("renders every section", async () => {
      renders.clear()
      const { page } = await open()
      expect([...renders.keys()]).toEqual(
        expect.arrayContaining([
          "app",
          "header",
          "sidebar",
          "stage",
          "overlays",
          "tab 02",
          "frame 02",
        ]),
      )
      page.unmount()
    })
  })

  // "stage" counts Canvas, which renders exactly when WorkspaceStage does.
  context("when Canvas saves its layout", () => {
    it("re-renders only the stage, Canvas and the terminals on it", async () => {
      const { page, services } = await open()
      const seen = rendersDuring(() =>
        services.commands.setCanvasLayout(firstTarget(services), (layout) => ({
          ...layout,
          viewport: { x: 10, y: 20, zoom: 1 },
        })),
      )
      const frames = Object.keys(seen).filter((name) => name.startsWith("frame "))
      expect(frames.length).toBeGreaterThan(0)
      expect(new Set(Object.keys(seen))).toEqual(new Set(["stage", ...frames]))
      page.unmount()
    })
  })

  context("when a rename keystroke changes the draft", () => {
    it("re-renders only the tab and the frame of the terminal being renamed", async () => {
      const { page, services } = await open()
      const terminal = services.workspace
        .getSnapshot()
        .projects.flatMap((project) => project.history)
        .flatMap((session) => session.state.roster.terminals)
        .find((item) => item.id === "02")!
      act(() => services.commands.startRename(terminal, "sidebar"))
      const seen = rendersDuring(() => services.commands.changeRenameDraft("02", "Server"))
      expect(seen).toEqual({ "tab 02": 1, "frame 02": 1 })
      page.unmount()
    })
  })
})
