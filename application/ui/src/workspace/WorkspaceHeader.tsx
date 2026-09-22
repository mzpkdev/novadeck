import {
  LayoutGrid,
  PanelLeft,
  Search,
  Settings2,
  SquareDashedMousePointer,
  Terminal as TerminalIcon,
} from "lucide-react"

import type { Project, ViewMode } from "./types"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"

const views = [
  { id: "focus", label: "Focus", icon: PanelLeft },
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "canvas", label: "Canvas", icon: SquareDashedMousePointer },
] as const

export const WorkspaceHeader = ({
  view,
  enabledViews,
  projects,
  project,
  onProjectSelect,
  onProjectCreate,
  onViewChange,
  onHome,
  onSearch,
  onPreferences,
}: {
  view: ViewMode
  enabledViews: ViewMode[]
  projects: Project[]
  project: Project
  onProjectSelect: (id: string) => void
  onProjectCreate: (name: string) => void
  onViewChange: (mode: ViewMode) => void
  onHome: () => void
  onSearch: () => void
  onPreferences: () => void
}): React.JSX.Element => {
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"
  return (
    <header className="app-header max-[1001px]:grid-cols-[minmax(0,1fr)_auto_auto] max-[1001px]:gap-3 max-[701px]:h-15 max-[701px]:px-3 max-[701px]:gap-2 grid h-16 shrink-0 items-center gap-6 border-b border-line bg-paper px-4 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="header-workspace max-[701px]:gap-2 flex min-w-0 items-center gap-4">
        <a
          href="#"
          className="brand max-[701px]:w-auto max-[701px]:text-[17px] max-[701px]:gap-[7px] [&>span:last-child]:max-[1001px]:hidden flex shrink-0 items-center gap-2 text-[16px] font-semibold tracking-[-0.6px] no-underline"
          aria-label="NovaDeck home"
          onClick={(event) => {
            event.preventDefault()
            onHome()
          }}
        >
          <span className="brand-symbol max-[701px]:size-[25px] flex size-7 items-center justify-center rounded-control border border-strong bg-strong text-white">
            <TerminalIcon size={18} strokeWidth={2} />
          </span>
          <span>
            novadeck<span className="text-muted">.</span>
          </span>
        </a>
        <WorkspaceSwitcher
          projects={projects}
          current={project}
          onSelect={onProjectSelect}
          onCreate={onProjectCreate}
        />
      </div>
      <nav
        className="view-switch max-[701px]:gap-0 flex shrink-0 gap-1 rounded-control border border-line bg-shell p-0.5"
        aria-label="Workspace layout"
      >
        {views
          .filter(({ id }) => enabledViews.includes(id))
          .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              aria-label={label}
              title={label}
              aria-pressed={view === id}
              className={`flex h-8 min-w-22 items-center justify-center gap-2 rounded-control border border-transparent px-3 text-[11px] text-muted hover:bg-soft hover:text-ink max-[701px]:min-w-0 max-[701px]:w-8 max-[701px]:px-2 max-[701px]:gap-0 max-[701px]:text-[10px] [&>span]:max-[701px]:hidden ${view === id ? "active" : ""}`}
            >
              <Icon size={14} strokeWidth={1.6} />
              <span>{label}</span>
            </button>
          ))}
      </nav>
      <div className="header-actions max-[1001px]:ml-0 max-[701px]:shrink-0 max-[701px]:gap-0 flex items-center justify-self-end gap-2">
        <button
          className="icon-button header-search max-[701px]:hidden w-auto gap-2 border border-line bg-paper px-2.5 text-[11px] [&_kbd]:ml-3 [&_kbd]:border-0 [&_kbd]:p-0 [&_kbd]:text-[9px] [&_kbd]:text-muted"
          aria-label="Find a terminal"
          title="Find a terminal (⌘K / Ctrl+K)"
          onClick={onSearch}
        >
          <Search size={15} />
          <span>Search</span>
          <kbd>{modifier} K</kbd>
        </button>
        <button className="icon-button" onClick={onPreferences} aria-label="Workspace preferences">
          <Settings2 size={16} />
        </button>
      </div>
    </header>
  )
}
