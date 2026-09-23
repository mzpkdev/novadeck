import { context, describe, expect, it } from "../../test"
import {
  activeProject,
  activeSession,
  createWorkspace,
  createWorkspaceSession,
  orderedSessions,
  workspaceReducer,
} from "./state"
import type { Project, Session, WorkspaceState } from "./types"

const project = (id: string): Project => ({
  id,
  name: id,
  directory: `~/projects/${id}`,
})

const terminal = (id: string): Session => ({
  id,
  name: `Terminal ${id}`,
  directory: "~/projects/storefront",
  command: "zsh",
  process: "zsh",
  state: "idle",
  kind: "shell",
  x: 80,
  y: 80,
  height: 400,
})

const workspaceState = (
  sessions: Session[],
  nextTerminalNumber = sessions.length + 1,
): WorkspaceState => ({
  view: "focus",
  windowedView: "grid",
  sessions,
  tabOrder: [],
  selected: sessions[0]?.id ?? "",
  entries: {},
  cleared: {},
  drafts: {},
  scrollOffsets: {},
  canvasLayout: { geometry: {}, minimized: {} },
  gridLayouts: {},
  gridMinimized: {},
  hidden: {},
  nextTerminalNumber,
})

const savedSession = (id: string, state: WorkspaceState) =>
  createWorkspaceSession({ name: id, state }, { id, now: 100 })

const seed = (projectId: string, sessionId: string, state: WorkspaceState) =>
  workspaceReducer(
    createWorkspace({ projects: [project(projectId)], activeProjectId: projectId }),
    {
      type: "project/select",
      projectId,
      now: 101,
      initialSession: savedSession(sessionId, state),
    },
  )

describe("workspace state", () => {
  context("when hiding terminals", () => {
    it("changes only visibility and retains terminal data until it is closed", () => {
      const state = workspaceState([terminal("01"), terminal("02")])
      state.drafts = { "01": "unfinished command" }
      state.canvasLayout.geometry = {
        "01": { position: { x: 144, y: 192 }, width: 600, height: 480 },
      }
      const workspace = seed("storefront", "saved", state)
      const target = { projectId: "storefront", workspaceSessionId: "saved" }
      const hidden = workspaceReducer(workspace, {
        type: "terminal/visibility",
        target,
        terminalId: "01",
        hidden: true,
      })
      expect(activeSession(hidden)?.state).toEqual({ ...state, hidden: { "01": true } })
      const shown = workspaceReducer(hidden, {
        type: "terminal/visibility",
        target,
        terminalId: "01",
        hidden: false,
      })
      expect(activeSession(shown)?.state).toEqual({ ...state, hidden: { "01": false } })
      const closed = workspaceReducer(hidden, { type: "terminal/close", target, terminalId: "01" })
      expect(activeSession(closed)?.state.hidden).toEqual({})
      expect(
        workspaceReducer(workspace, {
          type: "terminal/visibility",
          target,
          terminalId: "missing",
          hidden: true,
        }),
      ).toBe(workspace)
    })
  })
  context("when a project is opened for the first time", () => {
    it("seeds only the supplied initial session", () => {
      const workspace = createWorkspace({
        projects: [project("storefront"), project("api")],
        activeProjectId: "storefront",
      })
      const initial = savedSession("storefront-1", workspaceState([terminal("01")]))

      const opened = workspaceReducer(workspace, {
        type: "project/select",
        projectId: "api",
        now: 200,
        initialSession: initial,
      })

      expect(activeProject(opened)).toMatchObject({ id: "api", activeSessionId: "storefront-1" })
      expect(opened.projects.find((item) => item.id === "storefront")?.history).toEqual([])
    })
  })

  context("when a project has no initial session", () => {
    it("keeps the current project when selecting an unseeded project", () => {
      let workspace = seed("storefront", "saved", workspaceState([terminal("01")]))
      workspace = workspaceReducer(workspace, { type: "project/add", project: project("api") })
      expect(
        workspaceReducer(workspace, {
          type: "project/select",
          projectId: "api",
          now: 300,
        }),
      ).toBe(workspace)
    })

    it("rejects activating a new project without a session", () => {
      const workspace = seed("storefront", "saved", workspaceState([terminal("01")]))
      // Exercise the runtime guard as well as the action type's required initialSession.
      // @ts-expect-error An activating project/add requires an initial session.
      const next = workspaceReducer(workspace, {
        type: "project/add",
        project: project("api"),
        activate: true,
      })
      expect(next).toBe(workspace)
    })
  })

  context("when projects and sessions are switched", () => {
    it("keeps each saved session isolated", () => {
      let workspace = seed("storefront", "storefront-1", workspaceState([terminal("01")]))
      workspace = workspaceReducer(workspace, { type: "project/add", project: project("api") })
      workspace = workspaceReducer(workspace, {
        type: "project/select",
        projectId: "api",
        now: 200,
        initialSession: savedSession("api-1", workspaceState([terminal("01")])),
      })
      workspace = workspaceReducer(workspace, {
        type: "terminal/draft",
        target: { projectId: "api", workspaceSessionId: "api-1" },
        terminalId: "01",
        draft: "pnpm test",
      })
      workspace = workspaceReducer(workspace, {
        type: "project/select",
        projectId: "storefront",
        now: 300,
      })

      expect(activeSession(workspace)?.state.drafts).toEqual({})
      expect(
        workspace.projects.find((item) => item.id === "api")?.history[0]?.state.drafts,
      ).toEqual({ "01": "pnpm test" })
    })

    it("allows an empty selection when Grid or Canvas loses focus", () => {
      const workspace = seed("storefront", "saved", workspaceState([terminal("01")]))

      const unfocused = workspaceReducer(workspace, {
        type: "terminal/select",
        target: { projectId: "storefront", workspaceSessionId: "saved" },
        terminalId: "",
      })

      expect(activeSession(unfocused)?.state.selected).toBe("")
    })

    it("writes a stale target to its original session instead of the active one", () => {
      let workspace = seed("storefront", "old", workspaceState([terminal("01")]))
      workspace = workspaceReducer(workspace, {
        type: "session/add",
        projectId: "storefront",
        session: savedSession("new", workspaceState([terminal("01")])),
      })
      workspace = workspaceReducer(workspace, {
        type: "terminal/rename",
        target: { projectId: "storefront", workspaceSessionId: "old" },
        terminalId: "01",
        name: "Saved terminal",
      })

      expect(activeSession(workspace)?.id).toBe("new")
      expect(activeSession(workspace)?.state.sessions[0]?.name).toBe("Terminal 01")
      expect(workspace.projects[0]?.history.find((item) => item.id === "old")?.visitedAt).toBe(100)
      expect(
        workspace.projects[0]?.history.find((item) => item.id === "old")?.state.sessions[0]?.name,
      ).toBe("Saved terminal")
      expect(
        workspaceReducer(workspace, {
          type: "terminal/draft",
          target: { projectId: "storefront", workspaceSessionId: "missing" },
          terminalId: "01",
          draft: "must not move",
        }),
      ).toBe(workspace)
    })
  })

  context("when a terminal closes", () => {
    for (const selected of ["01", "02", ""]) {
      it(`preserves the Canvas camera and clears only a closed selection (${selected || "none"})`, () => {
        const state = workspaceState([terminal("01"), terminal("02")])
        state.view = "canvas"
        state.selected = selected
        state.canvasLayout.viewport = { x: -280, y: 96, zoom: 0.6 }
        const workspace = seed("storefront", "saved", state)

        const closed = workspaceReducer(workspace, {
          type: "terminal/close",
          target: { projectId: "storefront", workspaceSessionId: "saved" },
          terminalId: "01",
        })

        expect(activeSession(closed)?.state.selected).toBe(selected === "01" ? "" : selected)
        expect(activeSession(closed)?.state.canvasLayout.viewport).toEqual(
          state.canvasLayout.viewport,
        )
      })
    }

    it("chooses the next ordered neighbor and removes every terminal-owned record", () => {
      const state = workspaceState([terminal("01"), terminal("02"), terminal("03")], 4)
      state.tabOrder = ["02", "01", "03"]
      state.selected = "01"
      state.entries = { "01": [{ id: "entry", command: "ls", reply: "" }] }
      state.cleared = { "01": true }
      state.drafts = { "01": "draft" }
      state.scrollOffsets = { "01": 30 }
      state.canvasLayout = {
        minimized: { "01": true },
        geometry: { "01": { position: { x: 1, y: 2 }, width: 400 } },
      }
      state.gridLayouts = {
        wide: [
          { i: "01", x: 0, y: 0, w: 4, h: 10 },
          { i: "02", x: 4, y: 0, w: 4, h: 10 },
        ],
        mobile: [{ i: "01", x: 0, y: 0, w: 4, h: 10 }],
      }
      state.gridMinimized = { "01": true }
      const workspace = seed("storefront", "saved", state)

      const closed = workspaceReducer(workspace, {
        type: "terminal/close",
        target: { projectId: "storefront", workspaceSessionId: "saved" },
        terminalId: "01",
      })
      const restored = activeSession(closed)?.state

      expect(restored?.selected).toBe("03")
      expect(orderedSessions(restored!).map((session) => session.id)).toEqual(["02", "03"])
      expect(restored).toMatchObject({
        entries: {},
        cleared: {},
        drafts: {},
        scrollOffsets: {},
        canvasLayout: { minimized: {}, geometry: {} },
        gridMinimized: {},
      })
      expect(restored?.gridLayouts.wide?.map((item) => item.i)).toEqual(["02"])
      expect(restored?.gridLayouts.mobile).toEqual([])
    })
  })

  context("when a saved session is restored", () => {
    it("retains its canvas and grid layouts while another session is active", () => {
      const saved = workspaceState([terminal("01")], 2)
      saved.canvasLayout = {
        viewport: { x: 10, y: 20, zoom: 0.8 },
        minimized: { "01": true },
        geometry: { "01": { position: { x: 48, y: 72 }, width: 400, height: 300 } },
      }
      saved.gridLayouts = { desktop: [{ i: "01", x: 4, y: 8, w: 4, h: 12 }] }
      let workspace = seed("storefront", "saved", saved)
      workspace = workspaceReducer(workspace, {
        type: "session/add",
        projectId: "storefront",
        session: savedSession("fresh", workspaceState([])),
      })
      workspace = workspaceReducer(workspace, {
        type: "session/select",
        projectId: "storefront",
        workspaceSessionId: "saved",
        now: 400,
      })

      expect(activeSession(workspace)?.state.canvasLayout).toEqual(saved.canvasLayout)
      expect(activeSession(workspace)?.state.gridLayouts).toEqual(saved.gridLayouts)
    })

    it("uses the first enabled view without replacing the saved windowed preference", () => {
      const saved = workspaceState([terminal("01")])
      saved.view = "canvas"
      saved.windowedView = "canvas"
      let workspace = seed("storefront", "saved", saved)
      workspace = workspaceReducer(workspace, {
        type: "session/add",
        projectId: "storefront",
        session: savedSession("fresh", workspaceState([])),
      })

      workspace = workspaceReducer(workspace, {
        type: "session/select",
        projectId: "storefront",
        workspaceSessionId: "saved",
        now: 400,
        enabledViews: ["grid", "focus"],
      })

      expect(activeSession(workspace)?.state).toMatchObject({
        view: "grid",
        windowedView: "canvas",
      })
    })
  })

  context("when adding a terminal after restoration", () => {
    it("accepts unique terminal IDs independently of the saved mock ordinal", () => {
      let workspace = seed("storefront", "saved", workspaceState([terminal("01")], 7))
      const target = { projectId: "storefront", workspaceSessionId: "saved" }
      workspace = workspaceReducer(workspace, {
        type: "terminal/add",
        target,
        session: terminal("runtime-terminal"),
      })
      workspace = workspaceReducer(workspace, {
        type: "terminal/add",
        target,
        session: terminal("08"),
      })

      expect(activeSession(workspace)?.state.sessions.map((session) => session.id)).toEqual([
        "01",
        "runtime-terminal",
        "08",
      ])
      expect(activeSession(workspace)?.state.nextTerminalNumber).toBe(9)
    })

    it("ignores empty or duplicate IDs and missing targets without consuming the mock ordinal", () => {
      const workspace = seed(
        "storefront",
        "saved",
        workspaceState([terminal("runtime-terminal")], 7),
      )
      for (const id of ["runtime-terminal", ""]) {
        expect(
          workspaceReducer(workspace, {
            type: "terminal/add",
            target: { projectId: "storefront", workspaceSessionId: "saved" },
            session: terminal(id),
          }),
        ).toBe(workspace)
      }
      for (const target of [
        { projectId: "missing", workspaceSessionId: "saved" },
        { projectId: "storefront", workspaceSessionId: "missing" },
      ]) {
        expect(
          workspaceReducer(workspace, {
            type: "terminal/add",
            target,
            session: terminal("new-terminal"),
          }),
        ).toBe(workspace)
      }
      expect(activeSession(workspace)?.state.nextTerminalNumber).toBe(7)
    })
  })

  context("when updates arrive after their target is gone", () => {
    it("ignores unknown owners and terminals", () => {
      const workspace = seed("storefront", "saved", workspaceState([terminal("01")]))
      for (const target of [
        { projectId: "missing", workspaceSessionId: "saved" },
        { projectId: "storefront", workspaceSessionId: "missing" },
        { projectId: "storefront", workspaceSessionId: "saved" },
      ]) {
        expect(
          workspaceReducer(workspace, {
            type: "terminal/draft",
            target,
            terminalId: "missing",
            draft: "late draft",
          }),
        ).toBe(workspace)
      }
    })

    it("does not resurrect a closed terminal in late Canvas or Grid layouts", () => {
      const target = { projectId: "storefront", workspaceSessionId: "saved" }
      let workspace = seed("storefront", "saved", workspaceState([terminal("01"), terminal("02")]))
      workspace = workspaceReducer(workspace, { type: "terminal/close", target, terminalId: "01" })
      workspace = workspaceReducer(workspace, {
        type: "canvas/layout",
        target,
        layout: {
          viewport: { x: 30, y: 40, zoom: 0.6 },
          minimized: { "01": true, "02": false },
          geometry: { "01": { position: { x: 0, y: 0 } }, "02": { position: { x: 48, y: 72 } } },
        },
      })
      workspace = workspaceReducer(workspace, {
        type: "grid/layouts",
        target,
        layouts: {
          desktop: [
            { i: "01", x: 0, y: 0, w: 4, h: 10 },
            { i: "02", x: 4, y: 0, w: 4, h: 10 },
          ],
        },
      })
      const state = activeSession(workspace)!.state
      expect(state.canvasLayout).toEqual({
        viewport: { x: 30, y: 40, zoom: 0.6 },
        minimized: { "02": false },
        geometry: { "02": { position: { x: 48, y: 72 } } },
      })
      expect(state.gridLayouts.desktop?.map((item) => item.i)).toEqual(["02"])
    })
  })

  context("when Canvas sends a functional layout update", () => {
    it("updates only its target session", () => {
      let workspace = seed("storefront", "old", workspaceState([terminal("01")]))
      workspace = workspaceReducer(workspace, {
        type: "session/add",
        projectId: "storefront",
        session: savedSession("new", workspaceState([terminal("01")])),
      })
      workspace = workspaceReducer(workspace, {
        type: "canvas/layout",
        target: { projectId: "storefront", workspaceSessionId: "old" },
        layout: (previous) => ({
          ...previous,
          minimized: { ...previous.minimized, "01": true },
        }),
      })

      expect(activeSession(workspace)?.state.canvasLayout.minimized).toEqual({})
      expect(
        workspace.projects[0]?.history.find((item) => item.id === "old")?.state.canvasLayout
          .minimized,
      ).toEqual({
        "01": true,
      })
    })
  })

  context("when Grid terminals are minimized", () => {
    it("toggles Grid presentation without changing the Canvas state", () => {
      const state = workspaceState([terminal("01")])
      state.canvasLayout.minimized = { "01": true }
      const workspace = seed("storefront", "saved", state)
      const action = {
        type: "grid/minimize" as const,
        target: { projectId: "storefront", workspaceSessionId: "saved" },
        terminalId: "01",
      }

      const minimized = workspaceReducer(workspace, action)
      const restored = workspaceReducer(minimized, action)

      expect(activeSession(minimized)?.state.gridMinimized).toEqual({ "01": true })
      expect(activeSession(minimized)?.state.canvasLayout.minimized).toEqual({ "01": true })
      expect(activeSession(restored)?.state.gridMinimized).toEqual({ "01": false })
    })

    it("updates only its inactive target session", () => {
      let workspace = seed("storefront", "old", workspaceState([terminal("01")]))
      workspace = workspaceReducer(workspace, {
        type: "session/add",
        projectId: "storefront",
        session: savedSession("new", workspaceState([terminal("01")])),
      })
      workspace = workspaceReducer(workspace, {
        type: "grid/minimize",
        target: { projectId: "storefront", workspaceSessionId: "old" },
        terminalId: "01",
      })

      expect(activeSession(workspace)?.state.gridMinimized).toEqual({})
      expect(
        workspace.projects[0]?.history.find((item) => item.id === "old")?.state.gridMinimized,
      ).toEqual({ "01": true })
    })

    it("ignores unknown or closed terminals and prunes their minimized state", () => {
      const target = { projectId: "storefront", workspaceSessionId: "saved" }
      const state = workspaceState([terminal("01"), terminal("02")])
      state.gridMinimized = { "01": true, "02": true }
      let workspace = seed("storefront", "saved", state)
      workspace = workspaceReducer(workspace, { type: "terminal/close", target, terminalId: "01" })

      expect(activeSession(workspace)?.state.gridMinimized).toEqual({ "02": true })
      expect(workspaceReducer(workspace, { type: "grid/minimize", target, terminalId: "01" })).toBe(
        workspace,
      )
      expect(
        workspaceReducer(workspace, { type: "grid/minimize", target, terminalId: "missing" }),
      ).toBe(workspace)
    })
  })
})
