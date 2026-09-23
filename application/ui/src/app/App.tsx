import { History, Plus, Terminal as TerminalIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HashRouter, useNavigationType } from "react-router"

import { ToggleGroup, ToggleGroupItem } from "../ui-toolkit/ToggleGroup"
import { Tooltip } from "../ui-toolkit/Tooltip"
import { backgroundPointerHandlers } from "../workspace/layouts/background"
import { Canvas } from "../workspace/layouts/Canvas"
import { Focus } from "../workspace/layouts/Focus"
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
} from "../workspace/preferences/preferences-storage"
import { TerminalSearch } from "../workspace/search/TerminalSearch"
import { WorkspaceHeader } from "../workspace/shell/WorkspaceHeader"
import { useDesktop, WorkspacePanels } from "../workspace/shell/WorkspacePanels"
import { matchesShortcut, shortcutBindings } from "../workspace/shortcuts"
import { SessionsPanel } from "../workspace/sidebar/SessionsPanel"
import { SidebarPanel, sidebarCreateClasses } from "../workspace/sidebar/SidebarPanel"
import { SessionList } from "../workspace/terminals/SessionList"
import { Terminal, type MinimizeControls } from "../workspace/terminals/Terminal"
import { TerminalSwitcher } from "../workspace/terminals/TerminalSwitcher"
import { routeUrl } from "./routing"
import { useRouteDialog } from "./useRouteDialog"
import { useWorkspaceRoute } from "./useWorkspaceRoute"

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
  return initialProjects.reduce(
    (workspace, project) => {
      const session = newWorkspaceSession(projectSessions(project), view, readWindowedView())
      return workspaceReducer(workspace, {
        type: "session/add",
        projectId: project.id,
        session: { ...session, id: "initial" },
      })
    },
    createWorkspace({ projects: initialProjects, activeProjectId: initialProjects[0]!.id }),
  )
}

const useWorkspaceTarget = (projectId: string, workspaceSessionId: string) =>
  useMemo(() => ({ projectId, workspaceSessionId }), [projectId, workspaceSessionId])

const useLayoutHidden = (hidden: Record<string, boolean>, preview: string) =>
  useMemo(() => (preview ? { ...hidden, [preview]: false } : hidden), [hidden, preview])

export const App = (): React.JSX.Element => (
  <HashRouter useTransitions={false}>
    <WorkspaceApp />
  </HashRouter>
)

export const WorkspaceApp = (): React.JSX.Element => {
  const desktop = useDesktop()
  const navigationType = useNavigationType()
  const [preferences, setPreferences] = useState(readPreferences)
  const { workspace, dispatch, route, go, navigateWorkspace, closeDialog } = useWorkspaceRoute(
    preferences,
    initializeWorkspace,
  )
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
    hidden,
    nextTerminalNumber,
  } = current.state
  const ordered = orderedSessions(current.state)
  const preview = hidden[selected] ? selected : ""
  const layoutHidden = useLayoutHidden(hidden, preview)
  const target = useWorkspaceTarget(projectId, workspaceSessionId)
  const setSelected = (terminal: string): void => go({ terminal })
  const setVisibility = (terminalId: string, isHidden: boolean): void =>
    dispatch({ type: "terminal/visibility", target, terminalId, hidden: isHidden })
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
  const sidebarPanel = route.panel
  const setSidebarPanel = (panel: "terminals" | "sessions"): void => go({ panel })
  const [pendingPlacement, setPendingPlacement] = useState<{
    id: string
    context: string
    previousSelection: string
  } | null>(null)
  const [revealCanvas, setRevealCanvas] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState<{ id: string; view: ViewMode } | null>(null)
  const [recentSwitcher, setRecentSwitcher] = useState<{
    context: string
    ids: string[]
    index: number
    fromInput: boolean
  } | null>(null)
  const recentByContext = useRef<Record<string, string[]>>({})
  const [navigation, setNavigation] = useState({ count: 1, fit: false })
  const { searching, settings, onExitComplete } = useRouteDialog(
    route.dialog,
    `${projectId}/${workspaceSessionId}`,
  )
  const [sidebar, setSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const sidebarVisible = desktop ? !sidebarCollapsed : sidebar
  const context = `${projectId}/${workspaceSessionId}`
  const [focusPreview, setFocusPreview] = useState<{ context: string; id: string } | null>(null)
  const displayed = selected || (focusPreview?.context === context ? focusPreview.id : "")
  const active = sessions.find((session) => session.id === displayed) ?? sessions[0]
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

  const presentation = `${projectId}/${workspaceSessionId}/${view}/${selected}`
  const visibleRecentSwitcher =
    recentSwitcher?.context === context && !route.dialog ? recentSwitcher : null
  if (recentSwitcher && !visibleRecentSwitcher) setRecentSwitcher(null)
  useEffect(() => {
    const previous = recentByContext.current[context] ?? []
    recentByContext.current[context] = [
      ...(selected ? [selected] : []),
      ...previous.filter((id) => id !== selected && sessions.some((session) => session.id === id)),
      ...ordered
        .map((session) => session.id)
        .filter((id) => id !== selected && !previous.includes(id)),
    ]
  })
  const placement =
    view !== "focus" && pendingPlacement?.context === context && pendingPlacement.id === selected
      ? pendingPlacement.id
      : ""
  if (pendingPlacement && !placement) setPendingPlacement(null)
  const [freshSession, setFreshSession] = useState<string | null>(null)
  const [previousPresentation, setPreviousPresentation] = useState({ presentation, context })
  if (previousPresentation.presentation !== presentation) {
    setPreviousPresentation({ presentation, context })
    if (previousPresentation.context !== context || navigationType === "POP") {
      setNavigation((value) => ({ count: value.count + 1, fit: false }))
      setRevealCanvas(false)
      setSidebar(freshSession === workspaceSessionId)
      setFreshSession(null)
    }
  }
  useEffect(() => {
    if (navigationType === "POP" && presentation) cancelTerminalTransition()
  }, [navigationType, presentation])
  const switchSession = (id: string): void => {
    if (id === workspaceSessionId) return
    const next = workspaceSessions.find((item) => item.id === id)
    if (!next) return
    const now = currentTimestamp()
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
    while (workspaceSessions.some((item) => item.name === next.name))
      next.name = `${name} (${suffix++})`
    setFreshSession(next.id)
    setSidebarCollapsed(false)
    navigateWorkspace([{ type: "session/add", projectId, session: next }], { panel: "sessions" })
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
    const now = currentTimestamp()
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
  const add = (fromKeyboard = false): void => {
    if (fromKeyboard && placement) return
    const session = createMockTerminal(nextTerminalNumber, project.directory)
    const actions: Parameters<typeof navigateWorkspace>[0] = [
      { type: "terminal/add", target, session },
    ]
    setPendingPlacement(
      view === "focus"
        ? null
        : {
            id: session.id,
            previousSelection: selected,
            context,
          },
    )
    if (fromKeyboard && view === "focus") setKeyboardFocus({ id: session.id, view })
    navigateWorkspace(actions, { panel: "terminals" })
    setNavigation((value) => ({ count: value.count + 1, fit: false }))
    if (fromKeyboard) setSidebarCollapsed(false)
    setSidebar(fromKeyboard)
  }
  const rename = (terminalId: string, name: string): void =>
    dispatch({ type: "terminal/rename", target, terminalId, name })
  const close = (terminalId: string): void => {
    navigateWorkspace([{ type: "terminal/close", target, terminalId }], {}, true)
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
    onFlyTo?: () => void,
  ): React.JSX.Element => (
    <Terminal
      key={session.id}
      session={session}
      active={selected === session.id}
      placing={session.id === placement}
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
      focusInput={
        keyboardFocus?.id === session.id && keyboardFocus.view === view && selected === session.id
      }
      onInputFocused={() => setKeyboardFocus(null)}
      compact={compact}
      onClose={() => close(session.id)}
      {...(minimize ? { minimize } : {})}
      {...(onFlyTo ? { onFlyTo } : {})}
      {...(compact && preferences.enabledViews.includes("focus")
        ? {
            onFocus: () =>
              transitionTerminal(session.id, () => {
                go({ terminal: session.id, view: "focus" })
                setRevealCanvas(false)
                setSidebar(false)
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
    const workspaceEscape = (event: KeyboardEvent): void => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        route.dialog ||
        placement ||
        visibleRecentSwitcher
      )
        return
      if (
        document.querySelector(
          '[role="dialog"]:not(.sidebar-drawer):not([aria-hidden="true"]), [role="menu"]:not([hidden]), .session-tab.editing, .session-tab.dragging',
        )
      )
        return
      if (!selected && !sidebarVisible) return
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      if (selected) {
        if (view === "focus") setFocusPreview({ context, id: selected })
        setKeyboardFocus(null)
        setSelected("")
        document
          .querySelector<HTMLElement>(view === "focus" ? ".focus-stage" : `.${view}-viewport`)
          ?.focus({ preventScroll: true })
      } else hideSidebar()
    }
    const workspaceArrows = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.metaKey ||
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight"
      const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1
      if (visibleRecentSwitcher) {
        if (horizontal) return
        event.preventDefault()
        event.stopPropagation()
        const { ids, index } = visibleRecentSwitcher
        setRecentSwitcher({
          ...visibleRecentSwitcher,
          index: (index + direction + ids.length) % ids.length,
        })
        return
      }
      if (route.dialog || placement || event.ctrlKey || event.shiftKey) return
      const fromViewSwitch =
        event.target instanceof Element && Boolean(event.target.closest(".view-switch"))
      if (
        !fromViewSwitch &&
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], [role="listbox"], [role="combobox"], [role="slider"], [role="separator"], [role="radiogroup"], [role="tablist"]',
        )
      )
        return
      event.preventDefault()
      event.stopPropagation()
      if (horizontal) {
        const modes = viewModes.filter((mode) => preferences.enabledViews.includes(mode))
        const next = modes[(modes.indexOf(view) + direction + modes.length) % modes.length]
        if (next && next !== view) changeView(next)
        return
      }
      if (!ordered.length) return
      const index = ordered.findIndex((session) => session.id === selected)
      const next =
        index < 0
          ? direction > 0
            ? 0
            : ordered.length - 1
          : (index + direction + ordered.length) % ordered.length
      const session = ordered[next]
      if (session) {
        select(session.id)
        const fromTab =
          event.target instanceof Element && Boolean(event.target.closest(".session-tab"))
        if ((fromViewSwitch || fromTab) && sidebarVisible && sidebarPanel === "terminals")
          document
            .querySelector<HTMLElement>(`[data-session-id="${session.id}"] .sidebar-item-select`)
            ?.focus({ preventScroll: true })
      }
    }

    const keydown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
      const shortcuts = shortcutBindings()
      const fromInput =
        event.target instanceof HTMLInputElement &&
        event.target.getAttribute("aria-label")?.startsWith("Command for ") === true
      const renamed =
        event.target instanceof Element &&
        Boolean(event.target.closest('input[aria-label^="Rename "]'))
      if (renamed) return
      if (visibleRecentSwitcher && event.key === "Escape") {
        event.preventDefault()
        setRecentSwitcher(null)
        return
      }
      if (matchesShortcut(event, shortcuts.find)) {
        event.preventDefault()
        setRecentSwitcher(null)
        go({ dialog: "search" })
        return
      }
      if (matchesShortcut(event, shortcuts.preferences)) {
        event.preventDefault()
        setRecentSwitcher(null)
        go({ dialog: "preferences", section: "general" })
        return
      }
      if (route.dialog || placement) return
      if (matchesShortcut(event, shortcuts.newSession)) {
        event.preventDefault()
        if (event.repeat) return
        setRecentSwitcher(null)
        startFresh()
        return
      }
      if (
        matchesShortcut(event, shortcuts.terminals) ||
        matchesShortcut(event, shortcuts.sessions)
      ) {
        event.preventDefault()
        if (event.repeat) return
        setRecentSwitcher(null)
        toggleSidebar(matchesShortcut(event, shortcuts.terminals) ? "terminals" : "sessions")
        return
      }
      if (matchesShortcut(event, shortcuts.recent) || matchesShortcut(event, shortcuts.previous)) {
        const ids = visibleRecentSwitcher?.ids ?? recentByContext.current[context] ?? []
        if (ids.length < 2) return
        event.preventDefault()
        const direction = matchesShortcut(event, shortcuts.previous) ? -1 : 1
        const index =
          ((visibleRecentSwitcher?.index ?? (selected ? 0 : -1)) + direction + ids.length) %
          ids.length
        setRecentSwitcher({
          context,
          ids,
          index,
          fromInput: visibleRecentSwitcher?.fromInput ?? fromInput,
        })
        return
      }
      if (matchesShortcut(event, shortcuts.focus)) {
        const next = view === "focus" ? windowedDestination : "focus"
        if (!next || !preferences.enabledViews.includes(next)) return
        event.preventDefault()
        if (event.repeat) return
        if (fromInput && selected) setKeyboardFocus({ id: selected, view: next })
        changeView(next)
        return
      }
      if (matchesShortcut(event, shortcuts.newTerminal)) {
        event.preventDefault()
        if (event.repeat) return
        add(true)
      }
    }
    const keyup = (event: KeyboardEvent): void => {
      if (event.key !== "Control" || !recentSwitcher) return
      if (!visibleRecentSwitcher) {
        setRecentSwitcher(null)
        return
      }
      const id = visibleRecentSwitcher.ids[visibleRecentSwitcher.index]
      setRecentSwitcher(null)
      if (id && sessions.some((session) => session.id === id)) {
        if (visibleRecentSwitcher.fromInput) setKeyboardFocus({ id, view })
        select(id)
      }
    }
    const blur = (): void => setRecentSwitcher(null)
    window.addEventListener("keydown", workspaceEscape, true)
    window.addEventListener("keydown", workspaceArrows, true)
    window.addEventListener("keydown", keydown)
    window.addEventListener("keyup", keyup)
    window.addEventListener("blur", blur)
    return () => {
      window.removeEventListener("keydown", workspaceEscape, true)
      window.removeEventListener("keydown", workspaceArrows, true)
      window.removeEventListener("keydown", keydown)
      window.removeEventListener("keyup", keyup)
      window.removeEventListener("blur", blur)
    }
  })

  useEffect(() => {
    if (!placement || !pendingPlacement) return
    const cancelPlacement = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      const previous = pendingPlacement.previousSelection
      setPendingPlacement(null)
      navigateWorkspace(
        [{ type: "terminal/close", target, terminalId: placement }],
        { terminal: sessions.some((session) => session.id === previous) ? previous : "" },
        true,
      )
    }
    window.addEventListener("keydown", cancelPlacement, true)
    return () => window.removeEventListener("keydown", cancelPlacement, true)
  }, [placement, pendingPlacement, navigateWorkspace, target, sessions])

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
            className={`icon-button border ${activePanel ? "active border-line bg-paper text-ink shadow-control" : "border-transparent"}`}
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
        homeTo={routeUrl({ ...route, view: preferences.enabledViews[0]!, dialog: null })}
        onSearch={() => {
          setRecentSwitcher(null)
          go({ dialog: "search" })
        }}
        onPreferences={() => {
          setRecentSwitcher(null)
          go({ dialog: "preferences", section: "general" })
        }}
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
                titleHint={`Switch recent terminals · ${shortcutBindings().recent.display.join(" ")}`}
                count={sessions.length}
                active={sidebarPanel === "terminals"}
                onClose={hideSidebar}
              >
                <Tooltip
                  content={
                    placement
                      ? "Placing terminal · Esc to cancel"
                      : `New terminal · ${shortcutBindings().newTerminal.display.join(" ")}`
                  }
                >
                  <button
                    className={`${sidebarCreateClasses} data-[placing=true]:border-dashed data-[placing=true]:border-line-strong data-[placing=true]:bg-soft`}
                    data-placing={Boolean(placement)}
                    aria-label="New terminal"
                    aria-description={
                      placement ? "Placing a terminal. Press Escape to cancel." : undefined
                    }
                    onClick={() => add()}
                  >
                    <Plus size={14} className="shrink-0" />
                    <span className="min-w-0 truncate">Terminal</span>
                    <kbd className="mb-[-2px] ml-auto min-h-0 shrink-0 whitespace-nowrap border-0 bg-transparent p-0 text-[9px] text-muted opacity-70">
                      {placement ? "Esc" : shortcutBindings().newTerminal.display.join(" ")}
                    </kbd>
                  </button>
                </Tooltip>
                <SessionList
                  key={`${projectId}/${workspaceSessionId}`}
                  sessions={ordered}
                  placement={placement}
                  selected={selected}
                  hidden={hidden}
                  onVisibilityChange={setVisibility}
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
            key={`${projectId}/${workspaceSessionId}`}
            className={`main-area relative flex min-w-0 flex-1 flex-col ${view}`}
            aria-label={`${view} view`}
          >
            {view === "focus" && active && (
              <Focus
                sessions={sessions}
                displayed={active.id}
                onSelect={setSelected}
                render={(session) => terminal(session, false)}
              />
            )}
            {view === "grid" && sessions.length > 0 && (
              <Grid
                placement={placement}
                onPlace={() => setPendingPlacement(null)}
                sessions={sessions}
                hidden={layoutHidden}
                preview={preview}
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
                placement={placement}
                onPlace={() => setPendingPlacement(null)}
                hidden={layoutHidden}
                preview={preview}
                layout={canvasLayout}
                revealOnMount={revealCanvas}
                fitOnNavigate={navigation.fit}
                onLayoutChange={setCanvasLayout}
                sessions={sessions}
                selected={selected}
                navigation={navigation.count}
                onSelect={setSelected}
                render={(session, minimize, onFlyTo) => terminal(session, true, minimize, onFlyTo)}
              />
            )}
            {view !== "focus" &&
              sessions.length > 0 &&
              sessions.every((session) => layoutHidden[session.id]) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-muted">All terminals are hidden</p>
                  <button
                    className="small-button"
                    onClick={() => sessions.forEach((session) => setVisibility(session.id, false))}
                  >
                    Show all terminals
                  </button>
                </div>
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
                    <button
                      className="small-button primary"
                      aria-label="New terminal"
                      onClick={() => add()}
                    >
                      <Plus size={14} />
                      Terminal
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
      {visibleRecentSwitcher && (
        <TerminalSwitcher
          project={project.name}
          onClose={() => setRecentSwitcher(null)}
          onSelect={(id) => {
            setRecentSwitcher(null)
            select(id)
          }}
          sessions={visibleRecentSwitcher.ids.flatMap((id) => {
            const session = sessions.find((item) => item.id === id)
            return session ? [session] : []
          })}
          selected={visibleRecentSwitcher.ids[visibleRecentSwitcher.index]}
        />
      )}
      <TerminalSearch
        onExitComplete={onExitComplete}
        open={searching}
        key={`${projectId}/${workspaceSessionId}`}
        sessions={ordered}
        destination={searchLabel}
        onSelect={openSearchResult}
        onClose={closeDialog}
      />
      <Preferences
        key={`preferences/${projectId}/${workspaceSessionId}`}
        onExitComplete={onExitComplete}
        open={settings}
        value={preferences}
        tab={route.section}
        onTabChange={(section) => go({ section })}
        onChange={updatePreferences}
        onClose={closeDialog}
      />
    </main>
  )
}
