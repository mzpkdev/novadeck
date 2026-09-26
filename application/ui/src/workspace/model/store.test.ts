import { describe, expect, it } from "vitest"

import { createMockTerminal } from "../mock/sessions"
import { createSessionState, workspaceReducer } from "./state"
import { createWorkspaceStore } from "./store"
import type { Workspace } from "./types"

const target = { projectId: "project", workspaceSessionId: "initial" }
const initial = (): Workspace => ({
  activeProjectId: "project",
  projects: [
    {
      id: "project",
      name: "Project",
      directory: "~/project",
      activeSessionId: "initial",
      history: ["initial", "other"].map((id) => ({
        id,
        name: id,
        visitedAt: 0,
        state: createSessionState([createMockTerminal(1, "~/project")], "grid", "grid"),
      })),
    },
  ],
})
const state = (workspace: Workspace) => workspace.projects[0]!.history[0]!.state

describe("workspace commands", () => {
  it("preserves a rename dispatched before adding a terminal in a transaction", () => {
    const store = createWorkspaceStore(initial())
    store.dispatch({ type: "terminal/rename", target, terminalId: "01", name: "Server" })
    store.transact([{ type: "terminal/add", target, session: createMockTerminal(2, "~/project") }])
    expect(state(store.getSnapshot()).sessions.map((terminal) => terminal.name)).toEqual([
      "Server",
      "Terminal 02",
    ])
  })

  it("constructs consecutive commands from the latest state before rendering", () => {
    const store = createWorkspaceStore(initial())
    const add = () =>
      store.transact((workspace) => [
        {
          type: "terminal/add",
          target,
          session: createMockTerminal(state(workspace).nextTerminalNumber, "~/project"),
        },
      ])
    add()
    add()
    expect(state(store.getSnapshot()).sessions.map((terminal) => terminal.id)).toEqual([
      "01",
      "02",
      "03",
    ])
    expect(state(store.getSnapshot()).nextTerminalNumber).toBe(4)
  })

  it("publishes a complete transaction once and ignores obsolete targets", () => {
    const store = createWorkspaceStore(initial())
    let notifications = 0
    store.subscribe(() => notifications++)
    store.transact([
      { type: "terminal/rename", target, terminalId: "01", name: "Renamed" },
      { type: "terminal/select", target, terminalId: "" },
    ])
    expect(notifications).toBe(1)
    const previous = store.getSnapshot()
    store.dispatch({
      type: "terminal/rename",
      target: { ...target, projectId: "gone" },
      terminalId: "01",
      name: "Stale",
    })
    store.dispatch({
      type: "terminal/rename",
      target: { ...target, workspaceSessionId: "gone" },
      terminalId: "01",
      name: "Stale",
    })
    store.dispatch({ type: "terminal/rename", target, terminalId: "gone", name: "Stale" })
    expect(store.getSnapshot()).toBe(previous)
    expect(notifications).toBe(1)
    expect(previous.projects[0]!.history[1]!.state.sessions[0]!.name).toBe("Terminal 01")
  })

  it("keeps layout initialization separate from terminal metadata", () => {
    const terminal = createMockTerminal(1, "~/project")
    const canvasLayout = {
      geometry: { "01": { position: { x: 200, y: 300 }, width: 600, height: 400 } },
      minimized: {},
    }
    const session = createSessionState([terminal], "canvas", "canvas", { canvasLayout })
    expect(session.canvasLayout).toBe(canvasLayout)
    const store = createWorkspaceStore(initial())
    store.dispatch({
      type: "terminal/add",
      target,
      session: createMockTerminal(2, "~/project"),
      canvasGeometry: { position: { x: 900, y: 500 }, width: 600, height: 400 },
      gridLayouts: {
        desktop: [
          { i: "02", x: 0, y: 0, w: 3, h: 4 },
          { i: "obsolete", x: 3, y: 0, w: 3, h: 4 },
        ],
      },
    })
    expect(state(store.getSnapshot()).canvasLayout.geometry["02"]!.position).toEqual({
      x: 900,
      y: 500,
    })
    expect(state(store.getSnapshot()).gridLayouts.desktop!.map((item) => item.i)).toEqual(["02"])
  })

  it("closing removes every saved reference and ignores delayed layout items", () => {
    const workspace = initial()
    const seeded = state(workspace)
    seeded.tabOrder = ["01"]
    seeded.hidden = { "01": true }
    seeded.gridMinimized = { "01": true }
    seeded.gridRestoreWidths = { "01": { desktop: 3 } }
    seeded.sizePresets = { canvas: { "01": "large" }, grid: { "01": "large" } }
    seeded.canvasLayout = {
      geometry: { "01": { position: { x: 1, y: 1 } } },
      minimized: { "01": true },
    }
    seeded.gridLayouts = { desktop: [{ i: "01", x: 0, y: 0, w: 3, h: 4 }] }
    const closed = workspaceReducer(workspace, { type: "terminal/close", target, terminalId: "01" })
    expect(state(closed)).toMatchObject({
      sessions: [],
      selected: "",
      tabOrder: [],
      hidden: {},
      gridMinimized: {},
      gridRestoreWidths: {},
      sizePresets: { canvas: {}, grid: {} },
      canvasLayout: { geometry: {}, minimized: {} },
      gridLayouts: { desktop: [] },
    })
    const delayed = workspaceReducer(closed, {
      type: "grid/layouts",
      target,
      layouts: seeded.gridLayouts,
    })
    expect(state(delayed).gridLayouts).toEqual({ desktop: [] })
    const delayedCanvas = workspaceReducer(delayed, {
      type: "canvas/layout",
      target,
      layout: seeded.canvasLayout,
    })
    expect(state(delayedCanvas).canvasLayout).toEqual({ geometry: {}, minimized: {} })
  })
})
