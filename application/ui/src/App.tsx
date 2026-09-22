import {
  ArrowUpRight,
  Command,
  LayoutGrid,
  PanelLeft,
  Plus,
  Search,
  Settings2,
  SquareDashedMousePointer,
  Terminal as TerminalIcon,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Canvas } from "./workspace/Canvas"
import { Grid, type GridLayouts } from "./workspace/Grid"
import { mockReply, sessions as initialSessions, type Session } from "./workspace/sessions"
import { SessionTab } from "./workspace/SessionTab"
import { Terminal, type Entry, type MinimizeControls } from "./workspace/Terminal"

type View = "focus" | "grid" | "canvas"
const views = [
  { id: "focus", label: "Focus", icon: PanelLeft },
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "canvas", label: "Canvas", icon: SquareDashedMousePointer },
] as const

export const App = (): React.JSX.Element => {
  const [view, setView] = useState<View>("focus")
  const [sessions, setSessions] = useState(initialSessions)
  const [gridLayouts, setGridLayouts] = useState<GridLayouts>({})
  const [selected, setSelected] = useState("01")
  const [entries, setEntries] = useState<Record<string, Entry[]>>({})
  const [cleared, setCleared] = useState<Record<string, boolean>>({})
  const [navigation, setNavigation] = useState(0)
  const [query, setQuery] = useState("")
  const [settings, setSettings] = useState(false)
  const [fontSize, setFontSize] = useState(13)
  const [sidebar, setSidebar] = useState(false)
  const [searching, setSearching] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const settingsDialog = useRef<HTMLDialogElement>(null)
  const nextSession = useRef(initialSessions.length + 1)
  const active = sessions.find((session) => session.id === selected) ?? sessions[0]
  const matches = sessions.filter((session) =>
    `${session.name} ${session.directory}`.toLowerCase().includes(query.toLowerCase()),
  )

  const select = (id: string): void => {
    setSelected(id)
    setNavigation((value) => value + 1)
    setSidebar(false)
  }
  const add = (): void => {
    const number = nextSession.current++
    const id = String(number).padStart(2, "0")
    setSessions((previous) => [
      ...previous,
      {
        id,
        name: `Terminal ${id}`,
        directory: "~/projects/novadeck",
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
    const index = sessions.findIndex((session) => session.id === id)
    const remaining = sessions.filter((session) => session.id !== id)
    setSessions(remaining)
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
      entries={entries[session.id] ?? []}
      cleared={cleared[session.id] ?? false}
      onCommand={(command) => run(session, command)}
      compact={compact}
      {...(minimize ? { minimize } : {})}
      {...(compact
        ? {
            onClose: () => close(session.id),
            onFocus: () => {
              select(session.id)
              setView("focus")
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
    if (settings) settingsDialog.current?.showModal()
    else if (settingsDialog.current?.open) settingsDialog.current.close()
  }, [settings])
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault()
        setSearching(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
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
      style={{ "--terminal-font-size": `${fontSize}px` } as React.CSSProperties}
    >
      <header className="app-header">
        <a
          href="#"
          className="brand"
          aria-label="NovaDeck home"
          onClick={(event) => {
            event.preventDefault()
            setView("focus")
          }}
        >
          <span className="brand-symbol">
            <TerminalIcon size={18} strokeWidth={2} />
          </span>
          <span>
            novadeck<span className="text-muted">.</span>
          </span>
        </a>
        <nav className="view-switch" aria-label="Workspace layout">
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setView(id)
                setSidebar(false)
              }}
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
            className="icon-button"
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
        {view !== "grid" && (
          <>
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
            <aside
              className={`sidebar ${sidebar ? "sidebar-open" : ""}`}
              aria-label="Terminal sessions"
            >
              <div className="project-label">
                <span className="project-icon">
                  <Command size={17} />
                </span>
                <div>
                  <strong>Novadeck</strong>
                  <span>Local workspace</span>
                </div>
              </div>
              <div className="sidebar-section-title">
                <span>
                  TERMINALS <span className="session-count">{sessions.length}</span>
                </span>
              </div>
              <div className="session-list">
                {sessions.map((session) => (
                  <SessionTab
                    key={session.id}
                    session={session}
                    selected={selected === session.id}
                    onSelect={() => select(session.id)}
                    onRename={(name) => rename(session.id, name)}
                    onClose={() => close(session.id)}
                  />
                ))}
                {!sessions.length && (
                  <p className="px-3 py-3 text-[11px] text-muted">No open sessions</p>
                )}
              </div>
              <button className="new-session" onClick={add}>
                <Plus size={14} />
                <span>New terminal</span>
              </button>
              <div className="sidebar-bottom">
                <button
                  ref={settingsButton}
                  className="settings-button"
                  aria-label="Preferences"
                  onClick={() => setSettings(true)}
                >
                  <Settings2 size={15} />
                  <span>Preferences</span>
                  <span className="text-muted">⌘ ,</span>
                </button>
              </div>
            </aside>
          </>
        )}
        <section className={`main-area ${view}`} aria-label={`${view} view`}>
          <div className="view-toolbar">
            <div className="view-heading">
              <h1>
                {view === "focus"
                  ? (active?.name ?? "No terminals")
                  : view === "grid"
                    ? "Terminals"
                    : "Canvas"}
              </h1>
              {view === "focus" && active ? (
                <span className="focus-directory" title={active.directory}>
                  {active.directory}
                </span>
              ) : (
                <span className="view-description">{sessions.length} terminals</span>
              )}
            </div>
            {view !== "focus" && (
              <button className="small-button" onClick={add}>
                <Plus size={14} />
                <span>New terminal</span>
              </button>
            )}
          </div>
          {view === "focus" && active && (
            <div className="focus-stage">{terminal(active, false)}</div>
          )}
          {view === "grid" && sessions.length > 0 && (
            <Grid
              sessions={sessions}
              layouts={gridLayouts}
              onLayoutsChange={setGridLayouts}
              render={(session) => terminal(session, true)}
            />
          )}
          {view === "canvas" && sessions.length > 0 && (
            <Canvas
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
      {searching && (
        <div
          className="search-backdrop"
          onClick={() => {
            setSearching(false)
            searchButton.current?.focus()
          }}
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
                    select(matches[0].id)
                    setView(view === "grid" ? "focus" : view)
                    setSearching(false)
                    setQuery("")
                  }
                }}
              />
              <button
                className="icon-button"
                aria-label="Close search"
                onClick={() => {
                  setSearching(false)
                  searchButton.current?.focus()
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="search-results">
              {matches.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    select(session.id)
                    setView(view === "grid" ? "focus" : view)
                    setSearching(false)
                    setQuery("")
                  }}
                >
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
              Search by name or directory <kbd>esc to close</kbd>
            </div>
          </section>
        </div>
      )}
      <dialog
        ref={settingsDialog}
        className="preferences-dialog"
        aria-labelledby="preferences-title"
        onCancel={() => setSettings(false)}
        onClose={() => {
          setSettings(false)
          settingsButton.current?.focus()
        }}
      >
        <div className="preferences-heading">
          <h2 id="preferences-title">Preferences</h2>
          <button
            className="icon-button"
            aria-label="Close preferences"
            onClick={() => setSettings(false)}
          >
            <X size={17} />
          </button>
        </div>
        <label className="preference-row" htmlFor="font-size">
          <span>Terminal text size</span>
          <select
            id="font-size"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          >
            <option value={12}>Small · 12px</option>
            <option value={13}>Default · 13px</option>
            <option value={15}>Large · 15px</option>
          </select>
        </label>
        <p className="preferences-note">
          This is a local UI playground. Terminal output is sample content; commands never run on
          your machine.
        </p>
      </dialog>
    </main>
  )
}
