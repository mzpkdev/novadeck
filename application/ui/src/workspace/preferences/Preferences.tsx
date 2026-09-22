import { LayoutGrid, Moon, PanelLeft, SquareDashedMousePointer, Sun, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import "../shell/ModalMotion.css"
import type { PreferencesValue } from "../model/types"
import { viewModes } from "./preferences"

export const Preferences = ({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean
  value: PreferencesValue
  onChange: (value: PreferencesValue) => void
  onClose: () => void
}): React.JSX.Element => {
  const dialog = useRef<HTMLDialogElement>(null)
  const closing = useRef(false)
  const [tab, setTab] = useState("general")
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open && dialog.current?.open) {
      closing.current = true
      dialog.current.close()
    }
  }, [open])
  return (
    <dialog
      ref={dialog}
      className="preferences-dialog fixed m-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-popover border border-line-strong bg-paper p-5 text-ink shadow-none backdrop:bg-scrim backdrop:backdrop-blur-[3px] max-[360px]:w-[calc(100vw-24px)] max-[360px]:p-4"
      aria-labelledby="preferences-title"
      aria-hidden={!open}
      inert={!open}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (closing.current) {
          closing.current = false
          return
        }
        onClose()
      }}
    >
      <div className="preferences-heading flex min-h-[30px] items-center justify-between gap-4">
        <h2 id="preferences-title" className="m-0 text-[14px] font-medium tracking-[-0.2px]">
          Preferences
        </h2>
        <button className="icon-button size-8" aria-label="Close preferences" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div
        className="preferences-tabs mt-4.5 flex gap-4 border-b border-line"
        role="tablist"
        aria-label="Preference sections"
      >
        {(["general", "shortcuts"] as const).map((id) => (
          <button
            key={id}
            id={`preferences-tab-${id}`}
            className={`relative min-h-[31px] px-0.5 text-left text-[11px] ${tab === id ? "text-ink after:absolute after:right-0 after:bottom-[-1px] after:left-0 after:h-px after:bg-strong after:content-['']" : "text-muted"}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`preferences-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
              event.preventDefault()
              const next =
                event.key === "Home"
                  ? "general"
                  : event.key === "End"
                    ? "shortcuts"
                    : tab === "general"
                      ? "shortcuts"
                      : "general"
              setTab(next)
              dialog.current?.querySelector<HTMLButtonElement>(`#preferences-tab-${next}`)?.focus()
            }}
          >
            {id === "general" ? "General" : "Shortcuts"}
          </button>
        ))}
      </div>
      <div
        className="preferences-panel outline-none focus-visible:outline-2 focus-visible:outline-strong focus-visible:outline-offset-4"
        id="preferences-panel-general"
        role="tabpanel"
        aria-labelledby="preferences-tab-general"
        hidden={tab !== "general"}
        tabIndex={0}
      >
        <label
          className="preference-row flex min-h-[62px] items-center justify-between gap-4 border-b border-line text-[12px] text-ink"
          htmlFor="theme"
        >
          <span>Theme</span>
          <select
            className="min-w-[120px] rounded-control border border-line bg-paper px-2 py-1.75 text-[11px] text-ink"
            id="theme"
            defaultValue="monochrome"
          >
            <option value="monochrome">Monochrome</option>
          </select>
        </label>
        <div className="preference-row flex min-h-[62px] items-center justify-between gap-4 border-b border-line text-[12px] text-ink">
          <div className="flex flex-col gap-1">
            <span>Appearance</span>
            <span id="theme-mode-description" className="text-[10px] text-muted">
              Light mode only
            </span>
          </div>
          <div className="flex items-center gap-2" title="Dark mode is not available yet">
            <Sun size={14} strokeWidth={1.5} aria-hidden="true" className="text-muted" />
            <button
              type="button"
              role="switch"
              aria-label="Dark mode"
              aria-checked={false}
              aria-describedby="theme-mode-description"
              disabled
              className="relative h-5 w-9 cursor-not-allowed rounded-control border border-line bg-soft opacity-50"
            >
              <span className="absolute top-0.5 left-0.5 size-3.5 rounded-control border border-line-strong bg-paper" />
            </button>
            <Moon
              size={14}
              strokeWidth={1.5}
              aria-hidden="true"
              className="text-muted opacity-40"
            />
          </div>
        </div>
        <label
          className="preference-row flex min-h-[62px] items-center justify-between gap-4 border-b border-line text-[12px] text-ink"
          htmlFor="font-size"
        >
          <span>Terminal text size</span>
          <select
            className="min-w-[86px] rounded-control border border-line bg-paper px-2 py-1.75 text-[11px] text-ink"
            id="font-size"
            value={value.fontSize}
            onChange={(event) => onChange({ ...value, fontSize: Number(event.target.value) })}
          >
            <option value={12}>12px</option>
            <option value={13}>13px</option>
            <option value={15}>15px</option>
          </select>
        </label>
        <fieldset className="view-preferences m-0 mt-4 min-w-0 border-0 p-0">
          <legend className="mb-2.5 p-0 text-[12px]">View modes</legend>
          <div className="view-preference-options grid grid-cols-3 gap-1.5">
            {viewModes.map((mode) => {
              const checked = value.enabledViews.includes(mode)
              const Icon =
                mode === "focus"
                  ? PanelLeft
                  : mode === "grid"
                    ? LayoutGrid
                    : SquareDashedMousePointer
              return (
                <label
                  key={mode}
                  className={`relative flex min-h-[66px] min-w-0 flex-col justify-between gap-2 rounded-control border p-[9px] text-[12px] ${checked ? "border-line-strong bg-shell text-ink" : "border-line bg-paper text-muted hover:bg-shell hover:text-ink"} ${checked && value.enabledViews.length === 1 ? "cursor-not-allowed" : "cursor-pointer"} has-focus-visible:outline-2 has-focus-visible:outline-strong has-focus-visible:outline-offset-3 max-[360px]:min-h-[60px] max-[360px]:p-[7px] max-[360px]:text-[10px]`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && value.enabledViews.length === 1}
                    className="absolute top-2.5 right-2.5 m-0 size-3 accent-strong"
                    onChange={() =>
                      onChange({
                        ...value,
                        enabledViews: viewModes.filter((item) =>
                          item === mode ? !checked : value.enabledViews.includes(item),
                        ),
                      })
                    }
                  />
                  <Icon
                    aria-hidden="true"
                    className={`shrink-0 ${checked && value.enabledViews.length === 1 ? "opacity-45" : ""}`}
                    size={15}
                    strokeWidth={1.5}
                  />
                  <span>{mode === "focus" ? "Focus" : mode === "grid" ? "Grid" : "Canvas"}</span>
                </label>
              )
            })}
          </div>
          <p className="m-0 mt-[9px] text-[10px] text-muted">Keep at least one view enabled.</p>
        </fieldset>
      </div>
      <div
        className="preferences-panel outline-none focus-visible:outline-2 focus-visible:outline-strong focus-visible:outline-offset-4"
        id="preferences-panel-shortcuts"
        role="tabpanel"
        aria-labelledby="preferences-tab-shortcuts"
        hidden={tab !== "shortcuts"}
        tabIndex={0}
      >
        <dl className="shortcut-list m-0 mt-4 grid gap-0">
          <div className="flex min-h-[46px] items-center justify-between gap-4 border-b border-line text-[12px]">
            <dt className="m-0">Find a terminal</dt>
            <dd className="m-0 flex gap-1">
              <kbd className="text-muted">{modifier}</kbd>
              <kbd className="text-muted">K</kbd>
            </dd>
          </div>
          <div className="flex min-h-[46px] items-center justify-between gap-4 border-b border-line text-[12px]">
            <dt className="m-0">Open preferences</dt>
            <dd className="m-0 flex gap-1">
              <kbd className="text-muted">{modifier}</kbd>
              <kbd className="text-muted">,</kbd>
            </dd>
          </div>
        </dl>
      </div>
    </dialog>
  )
}
