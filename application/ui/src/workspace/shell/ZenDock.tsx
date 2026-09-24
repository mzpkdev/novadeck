import { ChevronLeft, LayoutGrid, PanelLeft, Plus, SquareDashedMousePointer, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

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
}): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  const dock = useRef<HTMLDivElement>(null)
  const create = useRef<HTMLButtonElement>(null)
  const controls = useId()
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent): void => {
      if (event.target instanceof Node && !dock.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [open])
  return (
    <div
      className="zen-dock absolute right-5 bottom-5 z-40 flex flex-row-reverse items-center gap-0.5 rounded-popover border border-line bg-paper/95 p-1 shadow-control backdrop-blur-sm max-[701px]:right-3 max-[701px]:bottom-3"
      ref={dock}
      data-open={open}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return
        event.preventDefault()
        event.stopPropagation()
        create.current?.focus({ preventScroll: true })
        setOpen(false)
      }}
      role="group"
      aria-label="Zen controls"
    >
      <Tooltip content={placing ? "Click the workspace to place · Esc to cancel" : "New terminal"}>
        <button
          ref={create}
          className={`zen-create icon-button ${placing ? "border border-dashed border-line-strong bg-soft" : ""}`}
          aria-label="New terminal"
          aria-pressed={placing}
          onClick={onCreate}
        >
          <Plus size={16} />
        </button>
      </Tooltip>
      <button
        className="zen-reveal flex h-8 w-5 shrink-0 items-center justify-center rounded-control text-muted hover:bg-soft hover:text-ink"
        aria-label={open ? "Hide Zen controls" : "Show Zen controls"}
        aria-expanded={open}
        aria-controls={controls}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronLeft size={12} className={open ? "rotate-180" : ""} />
      </button>
      <div className="zen-dock-reveal" inert={!open} aria-hidden={!open} id={controls}>
        <div className="zen-dock-actions flex items-center gap-0.5">
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
      </div>
    </div>
  )
}
