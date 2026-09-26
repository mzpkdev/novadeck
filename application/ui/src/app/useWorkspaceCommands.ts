import { useEffect, useState } from "react"

import type { useRecentSwitcher } from "../workspace/interaction/useRecentSwitcher"
import type { useTerminalRename } from "../workspace/interaction/useTerminalRename"
import { addCompactGridTerminal } from "../workspace/layouts/grid/placement"
import { cancelTerminalTransition, transitionTerminal } from "../workspace/layouts/transition"
import { createMockTerminal } from "../workspace/mock/sessions"
import { activeProject, activeSession } from "../workspace/model/state"
import type { Project, PreferencesValue, ViewMode, WorkspaceTarget } from "../workspace/model/types"
import type { useWorkspaceShell } from "../workspace/shell/useWorkspaceShell"
import { newWorkspaceSession } from "./demo-workspace"
import type { useWorkspaceRoute } from "./useWorkspaceRoute"

type AddTerminalOptions = { fromKeyboard?: boolean; beginRename?: boolean }

export const useWorkspaceCommands = ({
  routeState,
  preferences,
  setPreferences,
  target,
  shell,
  rename,
  recent,
}: {
  routeState: ReturnType<typeof useWorkspaceRoute>
  preferences: PreferencesValue
  setPreferences: (preferences: PreferencesValue) => void
  target: WorkspaceTarget
  shell: ReturnType<typeof useWorkspaceShell>
  rename: ReturnType<typeof useTerminalRename>
  recent: ReturnType<typeof useRecentSwitcher>
}) => {
  const { workspace, dispatch, go, navigateWorkspace, getWorkspace } = routeState
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
  const [created, setCreated] = useState<{ context: string; id: string } | null>(null)
  useEffect(() => {
    if (!created) return
    const timeout = window.setTimeout(() => setCreated(null), 900)
    return () => window.clearTimeout(timeout)
  }, [created])
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
    const next = newWorkspaceSession([], view, windowedView)
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
    const session = createMockTerminal(
      latestSession.state.nextTerminalNumber,
      latestProject.directory,
    )
    if (!beginRename && activeRename) finishRename(activeRename, true)
    const origin = !zen && desktop && (fromKeyboard || !sidebarCollapsed) ? "sidebar" : "header"
    setCreated({ context, id: session.id })
    if (beginRename) startRename(session, origin)
    const actions: Parameters<typeof navigateWorkspace>[0] = [
      {
        type: "terminal/add",
        target,
        session,
        gridLayouts: addCompactGridTerminal(
          latestSession.state.sessions,
          latestSession.state.gridLayouts,
          session,
        ),
      },
    ]
    navigateWorkspace(actions, { panel: "terminals" })
    setNavigation((value) => ({ count: value.count + 1, fit: false }))
    if (fromKeyboard) setSidebarCollapsed(false)
    setSidebar(false)
    return session.id
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
