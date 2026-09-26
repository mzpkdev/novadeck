import { useEffect } from "react"

import type { Backend } from "../../backend/port"
import { cancelTerminalTransition, transitionTerminal } from "../../layouts/transition"
import { addCompactGridTerminal } from "../../model/layout/grid-placement"
import { activeProject, activeSession, type WorkspaceAction } from "../../model/state"
import type {
  Project,
  PreferencesValue,
  ViewMode,
  Workspace,
  WorkspaceTarget,
} from "../../model/types"
import type { UiState } from "../ui-store"
import { useWorkspaceServices } from "./context"
import { newWorkspaceSession } from "./sessions"
import type { RecentSwitcherController } from "./useRecentSwitcher"
import { useStoreSelector } from "./useStoreSelector"
import type { TerminalRenameController } from "./useTerminalRename"
import type { WorkspaceNavigation } from "./useWorkspaceController"
import type { ShellController } from "./useWorkspaceShell"

export type AddTerminalOptions = { fromKeyboard?: boolean; beginRename?: boolean }

export type WorkspaceCommandsOptions = {
  workspace: Workspace
  navigation: Pick<WorkspaceNavigation, "dispatch" | "go" | "navigateWorkspace" | "getWorkspace">
  newTerminal: Backend["newTerminal"]
  preferences: PreferencesValue
  setPreferences: (preferences: PreferencesValue) => void
  target: WorkspaceTarget
  shell: Pick<
    ShellController,
    | "zen"
    | "desktop"
    | "sidebarCollapsed"
    | "setFreshSession"
    | "setSidebarCollapsed"
    | "setSidebar"
    | "setNavigation"
    | "setRevealCanvas"
  >
  rename: Pick<TerminalRenameController, "activeRename" | "finishRename" | "startRename">
  recent: Pick<RecentSwitcherController, "setRecentSwitcher">
}

// Workspace operations shared by the pointer UI and keyboard shortcuts.
export type WorkspaceCommands = {
  // The terminal created last in this session, highlighted briefly.
  readonly created: { context: string; id: string } | null
  readonly windowedDestination: ViewMode | undefined
  readonly switchSession: (id: string) => void
  readonly startFresh: () => void
  readonly switchProject: (next: Project) => void
  readonly select: (id: string, fit?: boolean) => void
  readonly setSelected: (terminal: string) => void
  readonly updatePreferences: (next: PreferencesValue) => void
  readonly changeView: (next: ViewMode) => void
  readonly openWindowed: (id: string) => void
  readonly openSearchResult: (id: string) => void
  // Returns the new terminal's ID, or "" when its session is gone.
  readonly add: (options?: AddTerminalOptions) => string
  readonly close: (terminalId: string) => void
}

const selectCreated = (state: UiState): UiState["created"] => state.created

export const useWorkspaceCommands = ({
  workspace,
  navigation,
  preferences,
  setPreferences,
  target,
  shell,
  rename,
  recent,
  newTerminal,
}: WorkspaceCommandsOptions): WorkspaceCommands => {
  const { ui } = useWorkspaceServices()
  const { dispatch, go, navigateWorkspace, getWorkspace } = navigation
  const project = activeProject(workspace)!
  const current = activeSession(workspace)!
  const projectId = project.id
  const workspaceSessionId = current.id
  const workspaceSessions = project.history
  const { view, windowedView, selected } = current.state
  const context = `${projectId}/${workspaceSessionId}`
  const {
    zen,
    desktop,
    sidebarCollapsed,
    setFreshSession,
    setSidebarCollapsed,
    setSidebar,
    setNavigation,
    setRevealCanvas,
  } = shell
  const { activeRename, finishRename, startRename } = rename
  const { setRecentSwitcher } = recent
  const setSelected = (terminal: string): void => go({ terminal })
  const windowedDestination = preferences.enabledViews.includes(windowedView)
    ? windowedView
    : preferences.enabledViews.find((mode) => mode !== "focus")
  const created = useStoreSelector(ui, selectCreated)
  const setCreated = (next: UiState["created"]): void =>
    void ui.update((state) => (state.created === next ? state : { ...state, created: next }))
  useEffect(() => {
    if (!created) return
    const timeout = window.setTimeout(
      () => ui.update((state) => (state.created === created ? { ...state, created: null } : state)),
      900,
    )
    return () => window.clearTimeout(timeout)
  }, [created, ui])
  const switchSession = (id: string): void => {
    if (id === workspaceSessionId) return
    const next = workspaceSessions.find((item) => item.id === id)
    if (!next) return
    const now = Date.now()
    navigateWorkspace([
      {
        type: "session/select",
        projectId,
        workspaceSessionId: id,
        now,
        enabledViews: preferences.enabledViews,
      },
    ])
  }
  const startFresh = (): void => {
    const next = newWorkspaceSession(view, windowedView)
    const name = next.name
    let suffix = 2
    const history = getWorkspace().projects.find((item) => item.id === projectId)?.history ?? []
    while (history.some((item) => item.name === next.name)) next.name = `${name} (${suffix++})`
    setFreshSession(next.id)
    setSidebarCollapsed(false)
    navigateWorkspace([{ type: "session/add", projectId, session: next }], { panel: "sessions" })
  }
  const switchProject = (next: Project): void => {
    if (next.id === projectId) return
    const now = Date.now()
    navigateWorkspace([
      {
        type: "project/select",
        projectId: next.id,
        now,
        enabledViews: preferences.enabledViews,
      },
    ])
  }
  const select = (id: string, fit = false): void => {
    setSelected(id)
    setNavigation((value) => ({ count: value.count + 1, fit }))
    setSidebar(false)
  }
  const updatePreferences = (next: PreferencesValue): void => {
    cancelTerminalTransition()
    setPreferences(next)
    dispatch({ type: "preferences/reconcile", target, preferences: next })
    if (!next.enabledViews.includes(view)) {
      setRevealCanvas(false)
      setSidebar(false)
    }
  }
  const changeView = (next: ViewMode): void => {
    if (!preferences.enabledViews.includes(next)) return
    navigateWorkspace([
      { type: "view/change", target, view: next, enabledViews: preferences.enabledViews },
    ])
    setRevealCanvas(false)
    setSidebar(false)
  }
  const showWindowed = (id: string): void => {
    if (!windowedDestination) return
    setNavigation((value) => ({ count: value.count + 1, fit: false }))
    setSidebar(false)
    setRevealCanvas(windowedDestination === "canvas")
    navigateWorkspace(
      [
        {
          type: "view/change",
          target,
          view: windowedDestination,
          enabledViews: preferences.enabledViews,
          rememberWindowed: false,
        },
      ],
      { terminal: id },
    )
  }
  const openWindowed = (id: string): void => transitionTerminal(id, () => showWindowed(id))
  const openSearchResult = (id: string): void => {
    go({ terminal: id, dialog: null })
    setNavigation((value) => ({ count: value.count + 1, fit: view === "canvas" }))
    setSidebar(false)
  }
  const add = ({ fromKeyboard = false, beginRename = true }: AddTerminalOptions = {}): string => {
    setRecentSwitcher(null)
    const latestProject = getWorkspace().projects.find((item) => item.id === projectId)
    const latestSession = latestProject?.history.find((item) => item.id === workspaceSessionId)
    if (!latestProject || !latestSession) return ""
    const terminal = newTerminal({
      number: latestSession.state.roster.nextNumber,
      directory: latestProject.directory,
    })
    if (!beginRename && activeRename) finishRename(activeRename, true)
    const origin = !zen && desktop && (fromKeyboard || !sidebarCollapsed) ? "sidebar" : "header"
    setCreated({ context, id: terminal.id })
    if (beginRename) startRename(terminal, origin)
    const actions: WorkspaceAction[] = [
      {
        type: "terminal/add",
        target,
        terminal,
        gridLayouts: addCompactGridTerminal(
          latestSession.state.roster.terminals,
          latestSession.state.layout.grid,
          terminal,
        ),
      },
    ]
    navigateWorkspace(actions, { panel: "terminals" })
    setNavigation((value) => ({ count: value.count + 1, fit: false }))
    if (fromKeyboard) setSidebarCollapsed(false)
    setSidebar(false)
    return terminal.id
  }
  const close = (terminalId: string): void => {
    if (activeRename?.id === terminalId) finishRename(activeRename, false)
    navigateWorkspace([{ type: "terminal/close", target, terminalId }], {}, true)
    if (selected === terminalId && view !== "canvas")
      setNavigation((value) => ({ count: value.count + 1, fit: false }))
  }
  return {
    created,
    windowedDestination,
    switchSession,
    startFresh,
    switchProject,
    select,
    setSelected,
    updatePreferences,
    changeView,
    openWindowed,
    openSearchResult,
    add,
    close,
  }
}
