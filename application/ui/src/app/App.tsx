import { History, Plus, Terminal as TerminalIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"

import { ToggleGroup, ToggleGroupItem } from "../ui-toolkit/ToggleGroup"
import { backgroundPointerHandlers } from "../workspace/layouts/background"
import { Canvas } from "../workspace/layouts/Canvas"
import { Grid } from "../workspace/layouts/Grid"
import {
  cancelTerminalTransition,
  transitionTerminal,
  transitionWorkspace,
} from "../workspace/layouts/transition"
import {
  mockReply,
  initialProjects,
  projectSessions,
  createMockTerminal,
} from "../workspace/mock/sessions"
import {
  activeProject,
  activeSession,
  createWorkspace,
  createWorkspaceSession,
  createSessionState,
  orderedSessions,
  workspaceReducer,
  type ValueUpdate,
} from "../workspace/model/state"
import type {
  Project,
  Session,
  Entry,
  ViewMode,
  WindowedView,
  PreferencesValue,
  CanvasLayout,
  GridLayouts,
  WorkspaceSession,
} from "../workspace/model/types"
import { Preferences } from "../workspace/preferences/Preferences"
import {
  viewModes,
  preferencesStorageKey,
  readPreferences,
} from "../workspace/preferences/preferences"
import { TerminalSearch } from "../workspace/search/TerminalSearch"
import { WorkspaceHeader } from "../workspace/shell/WorkspaceHeader"
import { useDesktop, WorkspacePanels } from "../workspace/shell/WorkspacePanels"
import { SessionsPanel } from "../workspace/sidebar/SessionsPanel"
import { SidebarPanel, sidebarCreateClasses } from "../workspace/sidebar/SidebarPanel"
import { SessionList } from "../workspace/terminals/SessionList"
import { Terminal, type MinimizeControls } from "../workspace/terminals/Terminal"

const collapsedStorageKey = "novadeck.sidebar-collapsed"
const readSidebarCollapsed = (): boolean => {
  try {
    return localStorage.getItem(collapsedStorageKey) === "true"
  } catch {
    return false
  }
}
const windowedStorageKey = "novadeck.windowed-view"
const readWindowedView = (): WindowedView => {
  try {
    return localStorage.getItem(windowedStorageKey) === "canvas" ? "canvas" : "grid"
  } catch {
    return "grid"
  }
}
const emptyEntries: Entry[] = []
const currentTimestamp = (): number => Date.now()
const newWorkspaceSession = (
  terminals: Session[],
  view: ViewMode,
  windowedView: WindowedView,
): WorkspaceSession => {
  const now = Date.now()
  return createWorkspaceSession(
    {
      name: new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now),
      state: createSessionState(terminals, view, windowedView),
    },
    { id: crypto.randomUUID(), now },
  )
}

const initializeWorkspace = (preferences: PreferencesValue) => {
  const view = preferences.enabledViews.includes("focus") ? "focus" : preferences.enabledViews[0]!
  const initial = initialProjects[0]!
  const session = newWorkspaceSession(projectSessions(initial), view, readWindowedView())
  return workspaceReducer(
    createWorkspace({ projects: initialProjects, activeProjectId: initial.id }),
    {
      type: "project/select",
      projectId: initial.id,
      now: session.visitedAt,
      initialSession: session,
    },
  )
}

const useWorkspace = (preferences: PreferencesValue) =>
  useReducer(workspaceReducer, preferences, initializeWorkspace)

const useWorkspaceTarget = (projectId: string, workspaceSessionId: string) =>
  useMemo(() => ({ projectId, workspaceSessionId }), [projectId, workspaceSessionId])

export const App = (): React.JSX.Element => {
  const desktop = useDesktop()
  const [preferences, setPreferences] = useState(readPreferences)
  const [workspace, dispatch] = useWorkspace(preferences)
  const project = activeProject(workspace)!
  const current = activeSession(workspace)!
  const projectId = project.id
  const workspaceSessionId = current.id
  const projects = workspace.projects
  const workspaceSessions = project.history
  const {
    view,
    windowedView,
    sessions,
    selected,
    entries,
    cleared,
    drafts,
    scrollOffsets,
    canvasLayout,
    gridLayouts,
    gridMinimized,
    nextTerminalNumber,
  } = current.state
  const ordered = orderedSessions(current.state)
  const target = useWorkspaceTarget(projectId, workspaceSessionId)
  const setSelected = useCallback(
    (terminalId: string) => dispatch({ type: "terminal/select", target, terminalId }),
    [dispatch, target],
  )
  const setCanvasLayout = useCallback(
    (layout: ValueUpdate<CanvasLayout>) => dispatch({ type: "canvas/layout", target, layout }),
    [dispatch, target],
  )
  const setGridLayouts = useCallback(
    (layouts: ValueUpdate<GridLayouts>) => dispatch({ type: "grid/layouts", target, layouts }),
    [dispatch, target],
  )
  const setTabOrder = (tabOrder: string[]): void =>
    dispatch({ type: "terminal/reorder", target, tabOrder })
  const [sidebarPanel, setSidebarPanel] = useState<"terminals" | "sessions">("terminals")
  const [revealCanvas, setRevealCanvas] = useState(false)
  const [navigation, setNavigation] = useState({ count: 0, fit: false })
  const [settings, setSettings] = useState(false)
  const [searching, setSearching] = useState(false)
  const pendingDialog = useRef<"search" | "preferences" | null>(null)
  const openPendingDialog = useCallback((): void => {
    const next = pendingDialog.current
    pendingDialog.current = null
    if (next === "search") setSearching(true)
    if (next === "preferences") setSettings(true)
  }, [setSearching, setSettings])
  const [sidebar, setSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const sidebarVisible = desktop ? !sidebarCollapsed : sidebar
  const active = sessions.find((session) => session.id === selected) ?? sessions[0]
  const windowedDestination = preferences.enabledViews.includes(windowedView)
    ? windowedView
    : preferences.enabledViews.find((mode) => mode !== "focus")
  const windowedLabel = windowedDestination === "canvas" ? "Canvas" : "Grid"
  const searchLabel = view === "canvas" ? "Canvas" : view === "grid" ? "Grid" : "Focus"
  useEffect(() => {
    try {
      localStorage.setItem(windowedStorageKey, windowedView)
    } catch {
      /* Remains available for this session when storage is unavailable. */
    }
  }, [windowedView])
  useEffect(() => {
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
    } catch {
      /* Preferences still apply when storage is unavailable. */
    }
  }, [preferences])
  useEffect(() => {
    try {
      localStorage.setItem(collapsedStorageKey, String(sidebarCollapsed))
    } catch {
      /* Collapsing still works when storage is unavailable. */
    }
  }, [sidebarCollapsed])

  const resetPresentation = (nextView: ViewMode): void => {
    pendingDialog.current = null
    cancelTerminalTransition()
    const restoredView = preferences.enabledViews.includes(nextView)
      ? nextView
      : preferences.enabledViews[0]!
    setNavigation({ count: restoredView === "grid" ? 1 : 0, fit: false })
    setRevealCanvas(false)
    setSidebar(false)
    setSearching(false)
    setSettings(false)
  }
  const switchSession = (id: string): void => {
    if (id === workspaceSessionId) return
    const next = workspaceSessions.find((item) => item.id === id)
    if (!next) return
    const now = currentTimestamp()
    dispatch({
      type: "session/select",
      projectId,
      workspaceSessionId: id,
      now,
      enabledViews: preferences.enabledViews,
    })
    resetPresentation(next.state.view)
  }
  const startFresh = (): void => {
    const next = newWorkspaceSession([], view, windowedView)
    const name = next.name
    let suffix = 2
    while (workspaceSessions.some((item) => item.name === next.name))
      next.name = `${name} (${suffix++})`
    dispatch({ type: "session/add", projectId, session: next })
    resetPresentation(next.state.view)
  }
  const showSessions = (): void => {
    setSidebarPanel("sessions")
    setSidebarCollapsed(false)
    setSidebar(true)
  }
  const hideSidebar = (): void => {
    setSidebarCollapsed(true)
    setSidebar(false)
    if (desktop) document.getElementById(`${sidebarPanel}-toggle`)?.focus()
  }
  const toggleSidebar = (panel: "terminals" | "sessions"): void => {
    if (sidebarPanel === panel && sidebarVisible) hideSidebar()
    else {
      setSidebarPanel(panel)
      setSidebarCollapsed(false)
      setSidebar(true)
    }
  }
  const switchProject = (next: Project): void => {
    if (next.id === projectId) return
    const saved = projects.find((item) => item.id === next.id)
    const history = saved?.history ?? []
    const restoredSession =
      history.find((item) => item.id === saved?.activeSessionId) ??
      history[0] ??
      newWorkspaceSession(projectSessions(next), view, windowedView)
    const now = currentTimestamp()
    dispatch({
      type: "project/select",
      projectId: next.id,
      now,
      initialSession: restoredSession,
      enabledViews: preferences.enabledViews,
    })
    resetPresentation(restoredSession.state.view)
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
    dispatch({ type: "view/change", target, view: next, enabledViews: preferences.enabledViews })
    setRevealCanvas(false)
    setSidebar(false)
  }
  const showWindowed = (id: string): void => {
    if (!windowedDestination) return
    select(id)
    setRevealCanvas(windowedDestination === "canvas")
    dispatch({
      type: "view/change",
      target,
      view: windowedDestination,
      enabledViews: preferences.enabledViews,
      rememberWindowed: false,
    })
  }
  const openWindowed = (id: string): void => transitionTerminal(id, () => showWindowed(id))
  const openSearchResult = (id: string): void => {
    setSearching(false)
    select(id, view === "canvas")
  }
  const add = (): void => {
    setSidebarPanel("terminals")
    dispatch({
      type: "terminal/add",
      target,
      session: createMockTerminal(nextTerminalNumber, project.directory),
    })
    setNavigation((value) => ({ count: value.count + 1, fit: false }))
    setSidebar(false)
  }
  const rename = (terminalId: string, name: string): void =>
    dispatch({ type: "terminal/rename", target, terminalId, name })
  const close = (terminalId: string): void => {
    dispatch({ type: "terminal/close", target, terminalId })
    if (selected === terminalId && view !== "canvas")
      setNavigation((value) => ({ count: value.count + 1, fit: false }))
  }
  const run = (session: Session, command: string): void => {
    if (command.trim() === "clear") {
      dispatch({ type: "terminal/output-clear", target, terminalId: session.id })
      return
    }
    dispatch({
      type: "terminal/output-entry",
      target,
      terminalId: session.id,
      entry: { id: crypto.randomUUID(), command, reply: mockReply(command, session) },
    })
  }
  const terminal = (
    session: Session,
    compact: boolean,
    minimize?: MinimizeControls,
  ): React.JSX.Element => (
    <Terminal
      key={session.id}
      session={session}
      projectName={project.name}
      entries={entries[session.id] ?? emptyEntries}
      draft={drafts[session.id] ?? ""}
      onDraftChange={(draft) =>
        dispatch({ type: "terminal/draft", target, terminalId: session.id, draft })
      }
      scrollOffset={scrollOffsets[session.id]}
      onScrollChange={(offset) =>
        dispatch({ type: "terminal/scroll", target, terminalId: session.id, offset })
      }
      cleared={cleared[session.id] ?? false}
      onCommand={(command) => run(session, command)}
      compact={compact}
      onClose={() => close(session.id)}
      {...(minimize ? { minimize } : {})}
      {...(compact && preferences.enabledViews.includes("focus")
        ? {
            onFocus: () =>
              transitionTerminal(session.id, () => {
                select(session.id)
                changeView("focus")
              }),
          }
        : !compact && windowedDestination
          ? {
              windowed: {
                destination: windowedLabel,
                onOpen: () => openWindowed(session.id),
              },
            }
          : {})}
    />
  )

  useEffect(() => {
    const requestDialog = (next: "search" | "preferences"): void => {
      if (pendingDialog.current) {
        pendingDialog.current = next
        return
      }
      if ((next === "search" && searching) || (next === "preferences" && settings)) return
      pendingDialog.current = next
      if (searching || settings) {
        // The outgoing dialog's exit callback opens the latest requested modal.
        setSearching(false)
        setSettings(false)
      } else {
        openPendingDialog()
      }
    }
    const keydown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault()
        requestDialog("search")
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        requestDialog("preferences")
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [searching, settings, openPendingDialog])

  const sidebarRail = (mobile = false): React.JSX.Element => (
    <ToggleGroup
      className="sidebar-tools z-30 flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-shell px-1.5 py-3"
      aria-label="Sidebar actions"
      orientation="vertical"
      value={sidebarVisible ? [sidebarPanel] : []}
      onValueChange={(value) => {
        const next = value[0]
        if (next === "terminals" || next === "sessions") toggleSidebar(next)
        else hideSidebar()
      }}
    >
      {(
        [
          { id: "terminals", label: "Terminals", icon: TerminalIcon },
          { id: "sessions", label: "Sessions", icon: History },
        ] as const
      ).map(({ id, label, icon: Icon }) => {
        const activePanel = sidebarPanel === id && sidebarVisible
        return (
          <ToggleGroupItem
            key={id}
            tooltip={label}
            value={id}
            id={`${mobile ? "mobile-" : ""}${id}-toggle`}
            className={`icon-button${activePanel ? " active" : ""}`}
            aria-label={label}
            aria-controls={`${id}-panel`}
            aria-expanded={activePanel}
          >
            <Icon size={17} />
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )

  return (
    <main
      className="workspace flex h-dvh min-h-100 flex-col overflow-hidden bg-paper"
      onPointerDownCapture={cancelTerminalTransition}
      onKeyDownCapture={cancelTerminalTransition}
      style={
        {
          "--terminal-font-size": `${preferences.fontSize}px`,
        } as React.CSSProperties
      }
    >
      <WorkspaceHeader
        view={view}
        enabledViews={preferences.enabledViews}
        projects={projects}
        project={project}
        onProjectSelect={(id) => {
          const next = projects.find((item) => item.id === id)
          if (next) switchProject(next)
        }}
        onViewChange={(id) => {
          if (view === id) return
          const direction = viewModes.indexOf(id) > viewModes.indexOf(view) ? 1 : -1
          transitionWorkspace(() => changeView(id), direction)
        }}
        onHome={() => changeView(preferences.enabledViews[0]!)}
        onSearch={() => setSearching(true)}
        onPreferences={() => setSettings(true)}
      />
      <div className="workspace-body relative flex min-h-0 flex-1">
        {sidebarRail()}
        <WorkspacePanels
          collapsed={sidebarCollapsed}
          mobileOpen={sidebar}
          onMobileOpenChange={(open) => {
            if (!open) hideSidebar()
          }}
          mobileRail={sidebarRail(true)}
          mobileLabel={sidebarPanel === "sessions" ? "Workspace sessions" : "Terminal sessions"}
          mobileFinalFocusEl={() => document.getElementById(`${sidebarPanel}-toggle`)}
          sidebar={
            <aside
              id="terminal-sidebar"
              className="sidebar relative flex w-57 shrink-0 flex-col overflow-hidden border-r border-line bg-shell"
              aria-label={sidebarPanel === "sessions" ? "Workspace sessions" : "Terminal sessions"}
              aria-hidden={!sidebarVisible}
              inert={!sidebarVisible}
            >
              <SidebarPanel
                id="sessions-panel"
                title="Sessions"
                count={workspaceSessions.length}
                active={sidebarPanel === "sessions"}
                onClose={hideSidebar}
              >
                <SessionsPanel
                  key={projectId}
                  items={workspaceSessions.map((item) => {
                    const terminals = item.state.sessions
                    return {
                      id: item.id,
                      name: item.name,
                      visitedAt: item.visitedAt,
                      terminalNames: terminals.map((entry) => entry.name),
                      running: terminals.filter((entry) => entry.state === "running").length,
                    }
                  })}
                  activeId={workspaceSessionId}
                  onSelect={switchSession}
                  onFresh={startFresh}
                />
              </SidebarPanel>
              <SidebarPanel
                id="terminals-panel"
                title="Terminals"
                count={sessions.length}
                active={sidebarPanel === "terminals"}
                onClose={hideSidebar}
              >
                <button className={sidebarCreateClasses} onClick={add}>
                  <Plus size={14} />
                  <span>New terminal</span>
                </button>
                <SessionList
                  key={workspaceSessionId}
                  sessions={ordered}
                  selected={selected}
                  onSelect={select}
                  onRename={rename}
                  onClose={close}
                  onReorder={setTabOrder}
                />
              </SidebarPanel>
            </aside>
          }
        >
          <section
            key={workspaceSessionId}
            className={`main-area flex min-w-0 flex-1 flex-col ${view}`}
            aria-label={`${view} view`}
          >
            {view === "focus" && active && (
              <div
                className="focus-stage max-[701px]:p-1.5 relative min-h-0 flex-1 overflow-hidden p-3 workspace-background"
                {...backgroundPointerHandlers}
              >
                <div className="workspace-dots absolute inset-0 canvas-grid" aria-hidden="true" />
                <div
                  className="workspace-dots absolute inset-0 canvas-grid-spotlight"
                  aria-hidden="true"
                />
                {terminal(active, false)}
              </div>
            )}
            {view === "grid" && sessions.length > 0 && (
              <Grid
                sessions={sessions}
                selected={selected}
                onSelect={setSelected}
                navigation={navigation.count}
                layouts={gridLayouts}
                onLayoutsChange={setGridLayouts}
                minimized={gridMinimized}
                onMinimize={(terminalId) => dispatch({ type: "grid/minimize", target, terminalId })}
                render={(session, minimize) => terminal(session, true, minimize)}
              />
            )}
            {view === "canvas" && sessions.length > 0 && (
              <Canvas
                layout={canvasLayout}
                revealOnMount={revealCanvas}
                fitOnNavigate={navigation.fit}
                onLayoutChange={setCanvasLayout}
                sessions={sessions}
                selected={selected}
                navigation={navigation.count}
                onSelect={setSelected}
                render={(session, minimize) => terminal(session, true, minimize)}
              />
            )}
            {!sessions.length && (
              <div
                className="empty-workspace relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 text-center text-muted workspace-background"
                {...backgroundPointerHandlers}
              >
                <div className="workspace-dots absolute inset-0 canvas-grid" aria-hidden="true" />
                <div
                  className="workspace-dots absolute inset-0 canvas-grid-spotlight"
                  aria-hidden="true"
                />
                <section className="empty-state relative z-1 flex w-full max-w-96 flex-col items-center rounded-panel border border-line bg-paper p-8 shadow-panel">
                  <span className="empty-state-icon mb-4 flex size-11 items-center justify-center rounded-control border border-line bg-shell text-muted">
                    <TerminalIcon size={22} strokeWidth={1.4} />
                  </span>
                  <h2 className="text-base font-medium tracking-tight text-ink">
                    No terminals open
                  </h2>
                  <p className="mt-2 max-w-60 text-xs leading-relaxed">
                    Open a terminal or pick up a previous session.
                  </p>
                  <div className="empty-state-actions mt-5 flex flex-wrap items-center justify-center gap-2">
                    <button className="small-button primary" onClick={add}>
                      <Plus size={14} />
                      New terminal
                    </button>
                    <button
                      className="empty-sessions-link rounded-control px-3 py-2 text-[11px] text-muted hover:bg-soft hover:text-ink"
                      onClick={showSessions}
                    >
                      Browse sessions
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        </WorkspacePanels>
      </div>
      <footer className="app-footer max-[701px]:px-3 max-[701px]:text-[8px] flex h-7 shrink-0 items-center justify-between border-t border-line bg-paper px-4 text-[10px] text-muted">
        <span className="flex items-center gap-2">
          <span>{sessions.length} terminals</span>
          <span className="footer-running max-[701px]:hidden ml-2 border-l border-line pl-3">
            {sessions.filter((session) => session.state === "running").length} running
          </span>
        </span>
      </footer>
      <TerminalSearch
        onExitComplete={openPendingDialog}
        open={searching}
        key={workspaceSessionId}
        sessions={ordered}
        destination={searchLabel}
        onSelect={openSearchResult}
        onClose={() => setSearching(false)}
      />
      <Preferences
        onExitComplete={openPendingDialog}
        open={settings}
        value={preferences}
        onChange={updatePreferences}
        onClose={() => setSettings(false)}
      />
    </main>
  )
}
