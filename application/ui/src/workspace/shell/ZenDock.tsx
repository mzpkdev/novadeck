import { LayoutGrid, PanelLeft, Plus, SquareDashedMousePointer, X } from "lucide-react"

import { Tooltip } from "../../ui-toolkit/Tooltip"
import type { ViewMode } from "../model/types"

const views = [
  { id: "focus", label: "Focus", icon: PanelLeft },
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "canvas", label: "Canvas", icon: SquareDashedMousePointer },
] as const

export const ZenDock = ({
  view,
  enabledViews,
  placing,
  onCreate,
  onViewChange,
  onExit,
}: {
  view: ViewMode
  enabledViews: ViewMode[]
  placing: boolean
  onCreate: () => void
  onViewChange: (view: ViewMode) => void
  onExit: () => void
}): React.JSX.Element => (
  <div
    className="zen-dock absolute right-5 bottom-5 z-40 flex items-center gap-0.5 rounded-popover border border-line bg-paper/95 p-1 shadow-control backdrop-blur-sm max-[701px]:right-3 max-[701px]:bottom-3"
    role="group"
    aria-label="Zen controls"
  >
    <Tooltip content={placing ? "Click the workspace to place · Esc to cancel" : "New terminal"}>
      <button
        className={`icon-button ${placing ? "border border-dashed border-line-strong bg-soft" : ""}`}
        aria-label="New terminal"
        aria-pressed={placing}
        onClick={onCreate}
      >
        <Plus size={16} />
      </button>
    </Tooltip>
    <div className="mx-0.5 h-3 w-px bg-line" aria-hidden="true" />
    <div className="view-switch flex gap-0.5" role="group" aria-label="Workspace layout">
      {views
        .filter(({ id }) => enabledViews.includes(id))
        .map(({ id, label, icon: Icon }) => (
          <Tooltip key={id} content={`${label} view`}>
            <button
              className={`icon-button ${view === id ? "bg-soft text-ink" : "text-muted"}`}
              aria-label={`${label} view`}
              aria-pressed={view === id}
              onClick={() => onViewChange(id)}
            >
              <Icon size={15} strokeWidth={1.6} />
            </button>
          </Tooltip>
        ))}
    </div>

    <div className="mx-0.5 h-3 w-px bg-line" aria-hidden="true" />
    <button
      className="zen-exit flex h-8 items-center gap-1.5 rounded-control px-2 text-[11px] text-muted hover:bg-soft hover:text-ink"
      onClick={onExit}
    >
      <X size={14} /> Exit Zen
    </button>
  </div>
)
