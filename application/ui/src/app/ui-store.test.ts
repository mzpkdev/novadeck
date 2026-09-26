import { createWorkspaceStore } from "../model/store"
import { initialShell } from "../shell/shell-state"
import { context, describe, expect, it } from "../test"
import { workspaceFixture } from "../test/fixtures"
import { createUiStore, persist, watchPresentation, type UiState } from "./ui-store"

const initial = (): UiState => ({
  location: {
    route: {
      projectId: "project",
      sessionId: "initial",
      view: "focus",
      terminal: "",
      panel: "terminals",
      dialog: null,
      section: "general",
    },
    dialogDepth: 0,
    navigationType: "POP",
  },
  preferences: { fontSize: 13, enabledViews: ["focus", "grid"] },
  shell: initialShell(false),
})

describe("UI store persistence", () => {
  context("when attached", () => {
    it("writes the slice at once and again only after it changes", () => {
      const ui = createUiStore(initial())
      const written: number[] = []
      const stop = persist(
        ui,
        (state) => state.preferences,
        (preferences) => written.push(preferences.fontSize),
      )
      expect(written).toEqual([13])
      ui.update((state) => ({ ...state }))
      expect(written).toEqual([13])
      ui.update((state) => ({ ...state, preferences: { ...state.preferences, fontSize: 15 } }))
      expect(written).toEqual([13, 15])
      stop()
      ui.update((state) => ({ ...state, preferences: { ...state.preferences, fontSize: 12 } }))
      expect(written).toEqual([13, 15])
    })
  })
})

const session = (id: string) => ({
  ...workspaceFixture().projects[0]!.history[0]!,
  id,
  name: id,
})

describe("presentation watch", () => {
  context("when a commit changes the session", () => {
    it("starts the presentation over and opens the drawer for the session just created", () => {
      const workspace = createWorkspaceStore(workspaceFixture({ sessions: ["initial", "other"] }))
      const ui = createUiStore(initial())
      const stop = watchPresentation(workspace, ui)
      ui.update((state) => ({
        ...state,
        shell: { ...state.shell, freshSession: "fresh", revealCanvas: true },
      }))
      workspace.dispatch({ type: "session/add", projectId: "project", session: session("fresh") })
      expect(ui.getSnapshot().shell).toMatchObject({
        navigation: { count: 2, fit: false },
        revealCanvas: false,
        sidebar: true,
        freshSession: null,
      })
      workspace.dispatch({
        type: "session/select",
        projectId: "project",
        workspaceSessionId: "other",
        now: 1,
      })
      expect(ui.getSnapshot().shell).toMatchObject({ navigation: { count: 3 }, sidebar: false })
      stop()
    })
  })

  context("when a commit keeps the session", () => {
    it("leaves the presentation alone", () => {
      const workspace = createWorkspaceStore(workspaceFixture())
      const ui = createUiStore(initial())
      const stop = watchPresentation(workspace, ui)
      const before = ui.getSnapshot()
      workspace.dispatch({
        type: "terminal/select",
        target: { projectId: "project", workspaceSessionId: "initial" },
        terminalId: "02",
      })
      expect(ui.getSnapshot()).toBe(before)
      stop()
    })
  })
})
