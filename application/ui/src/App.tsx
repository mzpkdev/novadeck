import {
  ArrowUpRight,
  LayoutGrid,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  SquareDashedMousePointer,
  Terminal as TerminalIcon,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { backgroundPointerHandlers } from "./workspace/background"
import { Canvas, type CanvasLayout } from "./workspace/Canvas"
import { Grid, type GridLayouts } from "./workspace/Grid"
import {
  Preferences,
  preferencesStorageKey,
  readPreferences,
  type PreferencesValue,
  type ViewMode,
} from "./workspace/Preferences"
import { SessionList } from "./workspace/SessionList"
import { mockReply, sessions as initialSessions, type Session } from "./workspace/sessions"
import { Terminal, type Entry, type MinimizeControls } from "./workspace/Terminal"
import {
  cancelTerminalTransition,
  transitionTerminal,
  transitionWorkspace,
} from "./workspace/transition"
import { WorkspacePanels } from "./workspace/WorkspacePanels"
import { WorkspaceSwitcher, type Project } from "./workspace/WorkspaceSwitcher"

type View = ViewMode
type WindowedView = Exclude<View, "focus">
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
const views = [
  { id: "focus", label: "Focus", icon: PanelLeft },
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "canvas", label: "Canvas", icon: SquareDashedMousePointer },
] as const

const initialProjects: Project[] = [
  { id: "storefront", name: "storefront", directory: "~/projects/storefront" },
  { id: "api-service", name: "api-service", directory: "~/projects/api-service" },
]
const projectSessions = (project: Project): Session[] =>
  initialSessions.map((session) => ({
    ...session,
    directory: session.directory.replace(/^~\/projects\/[^/]+/, project.directory),
  }))
type ProjectState = {
  sessions: Session[]
  tabOrder: string[]
  selected: string
  entries: Record<string, Entry[]>
  cleared: Record<string, boolean>
  canvasLayout: CanvasLayout
  gridLayouts: GridLayouts
  nextSession: number
}

export const App = (): React.JSX.Element => {
  const [preferences, setPreferences] = useState(readPreferences)
  const [view, setView] = useState<View>(() =>
    preferences.enabledViews.includes("focus") ? "focus" : preferences.enabledViews[0]!,
  )
  const [projects, setProjects] = useState(initialProjects)
  const [projectId, setProjectId] = useState("storefront")
  const project = projects.find((item) => item.id === projectId) ?? initialProjects[0]!
  const savedProjects = useRef<Record<string, ProjectState>>({})
  const [sessions, setSessions] = useState(() => projectSessions(initialProjects[0]!))
  const [tabOrder, setTabOrder] = useState<string[]>([])
  const orderedSessions = [
    ...tabOrder.flatMap((id) => {
      const session = sessions.find((item) => item.id === id)
      return session ? [session] : []
    }),
    ...sessions.filter((session) => !tabOrder.includes(session.id)),
  ]
  const [windowedView, setWindowedView] = useState<WindowedView>(readWindowedView)
  const [revealCanvas, setRevealCanvas] = useState(false)
  const windowedDestination = preferences.enabledViews.includes(windowedView)
    ? windowedView
    : preferences.enabledViews.find((mode) => mode !== "focus")
  const searchDestination = windowedDestination ?? "focus"
  const windowedLabel =
    searchDestination === "canvas" ? "Canvas" : searchDestination === "grid" ? "Grid" : "Focus"
  useEffect(() => {
    try {
      localStorage.setItem(windowedStorageKey, windowedView)
    } catch {
      // The preference still works for this session when browser storage is unavailable.
    }
  }, [windowedView])
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayout>({ geometry: {}, minimized: {} })
  const [gridLayouts, setGridLayouts] = useState<GridLayouts>({})
  const [selected, setSelected] = useState("01")
  const [entries, setEntries] = useState<Record<string, Entry[]>>({})
  const [cleared, setCleared] = useState<Record<string, boolean>>({})
  const [navigation, setNavigation] = useState(0)
  const [query, setQuery] = useState("")
  const [settings, setSettings] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
    } catch {
      // Preferences still apply when storage is unavailable.
    }
  }, [preferences])
  const [sidebar, setSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  useEffect(() => {
    try {
      localStorage.setItem(collapsedStorageKey, String(sidebarCollapsed))
    } catch {
      // Collapsing remains available when browser storage is unavailable.
    }
  }, [sidebarCollapsed])
  const [searching, setSearching] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const nextSession = useRef(initialSessions.length + 1)
  const active = sessions.find((session) => session.id === selected) ?? sessions[0]
  const matches = orderedSessions.filter((session) =>
    `${session.name} ${session.directory}`.toLowerCase().includes(query.toLowerCase()),
  )

  const switchProject = (next: Project): void => {
    if (next.id === projectId) return
    cancelTerminalTransition()
    savedProjects.current[projectId] = {
      sessions,
      tabOrder,
      selected,
      entries,
      cleared,
      canvasLayout,
      gridLayouts,
      nextSession: nextSession.current,
    }
    const saved = savedProjects.current[next.id]
    setSessions(saved?.sessions ?? projectSessions(next))
    setTabOrder(saved?.tabOrder ?? [])
    setSelected(saved?.selected ?? "01")
    setEntries(saved?.entries ?? {})
    setCleared(saved?.cleared ?? {})
    setCanvasLayout(saved?.canvasLayout ?? { geometry: {}, minimized: {} })
    setGridLayouts(saved?.gridLayouts ?? {})
    nextSession.current = saved?.nextSession ?? initialSessions.length + 1
    setNavigation(0)
    setRevealCanvas(false)
    setSidebar(false)
    setSearching(false)
    setSettings(false)
    setQuery("")
    setProjectId(next.id)
  }
  const createProject = (name: string): void => {
    const next = { id: crypto.randomUUID(), name, directory: `~/projects/${name}` }
    savedProjects.current[next.id] = {
      sessions: [],
      tabOrder: [],
      selected: "",
      entries: {},
      cleared: {},
      canvasLayout: { geometry: {}, minimized: {} },
      gridLayouts: {},
      nextSession: 1,
    }
    setProjects((previous) => [...previous, next])
    switchProject(next)
  }

  const select = (id: string): void => {
    setSelected(id)
    setNavigation((value) => value + 1)
    setSidebar(false)
  }
  const updatePreferences = (next: PreferencesValue): void => {
    cancelTerminalTransition()
    setPreferences(next)
    if (!next.enabledViews.includes(view)) {
      setView(next.enabledViews.includes(windowedView) ? windowedView : next.enabledViews[0]!)
      setRevealCanvas(false)
      setSidebar(false)
    }
  }
  const changeView = (next: View): void => {
    if (!preferences.enabledViews.includes(next)) return
    if (next !== "focus") setWindowedView(next)
    setRevealCanvas(false)
    setView(next)
    setSidebar(false)
  }
  const showWindowed = (id: string): void => {
    select(id)
    setRevealCanvas(searchDestination === "canvas")
    setView(searchDestination)
  }
  const openWindowed = (id: string): void => {
    transitionTerminal(id, () => showWindowed(id))
  }
  const openSearchResult = (id: string): void => {
    const open = (): void => {
      setSearching(false)
      setQuery("")
      showWindowed(id)
    }
    if (view === searchDestination) open()
    else transitionWorkspace(open, view === "canvas" ? -1 : 1)
  }
  const add = (): void => {
    const number = nextSession.current++
    const id = String(number).padStart(2, "0")
    setSessions((previous) => [
      ...previous,
      {
        id,
        name: `Terminal ${id}`,
        directory: project.directory,
        command: "zsh",
        process: "zsh",
        state: "idle",
        kind: "shell",
        x: 80 + ((number - 1) % 3) * 610,
        y: 80 + Math.floor((number - 1) / 3) * 470,
        height: 400,
      },
    ])
    setCleared((previous) => ({ ...previous, [id]: true }))
    select(id)
  }
  const rename = (id: string, name: string): void => {
    setSessions((previous) =>
      previous.map((session) => (session.id === id ? { ...session, name } : session)),
    )
  }
  const close = (id: string): void => {
    const index = orderedSessions.findIndex((session) => session.id === id)
    const remaining = orderedSessions.filter((session) => session.id !== id)
    setSessions((previous) => previous.filter((session) => session.id !== id))
    setTabOrder((previous) => previous.filter((item) => item !== id))
    if (selected === id) {
      setSelected((remaining[index] ?? remaining[index - 1])?.id ?? "")
      setNavigation((value) => value + 1)
    }
    setEntries((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
    setCleared((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
  }
  const run = (session: Session, command: string): void => {
    if (command.trim() === "clear") {
      setCleared((previous) => ({ ...previous, [session.id]: true }))
      setEntries((previous) => ({ ...previous, [session.id]: [] }))
      return
    }
    setEntries((previous) => ({
      ...previous,
      [session.id]: [
        ...(previous[session.id] ?? []),
        { id: crypto.randomUUID(), command, reply: mockReply(command, session) },
      ],
    }))
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
      entries={entries[session.id] ?? []}
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
    if (!searching) return
    const trigger = document.activeElement as HTMLElement | null
    searchInput.current?.focus()
    return () => trigger?.focus()
  }, [searching])
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault()
        setSettings(false)
        setSearching(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        setSearching(false)
        setSettings(true)
      }
      if (event.key === "Escape") {
        setSearching(false)
        setSettings(false)
        setSidebar(false)
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [])

  return (
    <main
      className="workspace"
      onPointerDownCapture={cancelTerminalTransition}
      onKeyDownCapture={cancelTerminalTransition}
      style={
        {
          "--terminal-font-size": `${preferences.fontSize}px`,
        } as React.CSSProperties
      }
    >
      <header className="app-header">
        <a
          href="#"
          className="brand"
          aria-label="NovaDeck home"
          onClick={(event) => {
            event.preventDefault()
            changeView(preferences.enabledViews[0]!)
          }}
        >
          <span className="brand-symbol">
            <TerminalIcon size={18} strokeWidth={2} />
          </span>
          <span>
            novadeck<span className="text-muted">.</span>
          </span>
        </a>
        <WorkspaceSwitcher
          projects={projects}
          current={project}
          onSelect={(id) => {
            const next = projects.find((item) => item.id === id)
            if (next) switchProject(next)
          }}
          onCreate={createProject}
        />
        <nav className="view-switch" aria-label="Workspace layout">
          {views
            .filter(({ id }) => preferences.enabledViews.includes(id))
            .map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  if (view !== id) {
                    const direction =
                      views.findIndex((item) => item.id === id) >
                      views.findIndex((item) => item.id === view)
                        ? 1
                        : -1
                    transitionWorkspace(() => changeView(id), direction)
                  }
                }}
                aria-label={label}
                title={label}
                aria-pressed={view === id}
                className={view === id ? "active" : ""}
              >
                <Icon size={14} strokeWidth={1.6} />
                <span>{label}</span>
              </button>
            ))}
        </nav>
        <div className="header-actions">
          <button
            ref={searchButton}
            className="icon-button header-search"
            aria-label="Find a terminal"
            title="Find a terminal (⌘K / Ctrl+K)"
            onClick={() => setSearching(true)}
          >
            <Search size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => setSettings(true)}
            aria-label="Workspace preferences"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>
      <div className="workspace-body">
        <div
          className="sidebar-tools"
          role="toolbar"
          aria-label="Sidebar actions"
          aria-orientation="vertical"
        >
          <button
            className="icon-button"
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-controls="terminal-sidebar"
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((previous) => !previous)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <button
          className="mobile-sidebar-toggle icon-button"
          aria-label="Toggle sessions"
          aria-expanded={sidebar}
          onClick={() => setSidebar(!sidebar)}
        >
          <PanelLeft size={17} />
        </button>
        {sidebar && (
          <button
            className="sidebar-scrim"
            aria-label="Close sessions"
            onClick={() => setSidebar(false)}
          />
        )}
        <WorkspacePanels
          collapsed={sidebarCollapsed}
          sidebar={
            <aside
              id="terminal-sidebar"
              className={`sidebar ${sidebar ? "sidebar-open" : ""}`}
              aria-label="Terminal sessions"
            >
              <div className="sidebar-section-title">
                <span>
                  TERMINALS <span className="session-count">{sessions.length}</span>
                </span>
              </div>
              <SessionList
                key={projectId}
                sessions={orderedSessions}
                selected={selected}
                onSelect={select}
                onRename={rename}
                onClose={close}
                onReorder={setTabOrder}
              />
              <button className="new-session" onClick={add}>
                <Plus size={14} />
                <span>New terminal</span>
              </button>
            </aside>
          }
        >
          <section key={projectId} className={`main-area ${view}`} aria-label={`${view} view`}>
            {view === "focus" && active && (
              <div className="focus-stage workspace-background" {...backgroundPointerHandlers}>
                <div className="workspace-dots canvas-grid" aria-hidden="true" />
                <div className="workspace-dots canvas-grid-spotlight" aria-hidden="true" />
                {terminal(active, false)}
              </div>
            )}
            {view === "grid" && sessions.length > 0 && (
              <Grid
                sessions={sessions}
                selected={selected}
                onSelect={setSelected}
                navigation={navigation}
                layouts={gridLayouts}
                onLayoutsChange={setGridLayouts}
                render={(session) => terminal(session, true)}
              />
            )}
            {view === "canvas" && sessions.length > 0 && (
              <Canvas
                layout={canvasLayout}
                revealOnMount={revealCanvas}
                onLayoutChange={setCanvasLayout}
                sessions={sessions}
                selected={selected}
                navigation={navigation}
                onSelect={setSelected}
                render={(session, minimize) => terminal(session, true, minimize)}
              />
            )}
            {!sessions.length && (
              <div className="empty-workspace">
                <TerminalIcon size={24} strokeWidth={1.2} />
                <h2>No terminals open</h2>
                <p>Create a terminal to start a session.</p>
                <button className="small-button" onClick={add}>
                  <Plus size={14} />
                  New terminal
                </button>
              </div>
            )}
          </section>
        </WorkspacePanels>
      </div>
      <footer className="app-footer">
        <span className="flex items-center gap-2">
          <span>{sessions.length} sessions</span>
          <span className="footer-running">
            {sessions.filter((session) => session.state === "running").length} running
          </span>
        </span>
        <button onClick={() => setSearching(true)}>
          Find a terminal <kbd>⌘ K</kbd>
        </button>
      </footer>
      <div
        className="search-backdrop"
        data-state={searching ? "open" : "closed"}
        aria-hidden={!searching}
        inert={!searching}
        onClick={() => setSearching(false)}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Find a terminal"
          className="search-dialog"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>("button, input"),
              )
              const index = controls.indexOf(document.activeElement as HTMLElement)
              event.preventDefault()
              controls[
                (index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length
              ]?.focus()
            }
          }}
        >
          <div className="search-field">
            <Search size={18} />
            <input
              ref={searchInput}
              aria-label="Search terminals"
              placeholder="Find a terminal…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches[0]) {
                  openSearchResult(matches[0].id)
                }
              }}
            />
            <button
              className="icon-button"
              aria-label="Close search"
              onClick={() => setSearching(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="search-results">
            {matches.map((session) => (
              <button key={session.id} onClick={() => openSearchResult(session.id)}>
                <TerminalIcon size={16} />
                <span>
                  {session.name}
                  <small>{session.directory}</small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!matches.length && (
              <p className="p-6 text-center text-muted">No terminals match “{query}”.</p>
            )}
          </div>
          <div className="search-footnote">
            <span>Open in {windowedLabel}</span> <kbd>esc to close</kbd>
          </div>
        </section>
      </div>
      <Preferences
        open={settings}
        value={preferences}
        onChange={updatePreferences}
        onClose={() => setSettings(false)}
      />
    </main>
  )
}
