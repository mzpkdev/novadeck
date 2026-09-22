import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import "./ModalMotion.css"

export const viewModes = ["focus", "grid", "canvas"] as const
export type ViewMode = (typeof viewModes)[number]
export type PreferencesValue = { fontSize: number; enabledViews: ViewMode[] }
export const preferencesStorageKey = "novadeck.preferences"
export const readPreferences = (): PreferencesValue => {
  const defaults: PreferencesValue = { fontSize: 13, enabledViews: [...viewModes] }
  try {
    const saved = JSON.parse(
      localStorage.getItem(preferencesStorageKey) ?? "null",
    ) as Partial<PreferencesValue> | null
    const enabledViews = Array.isArray(saved?.enabledViews)
      ? viewModes.filter((mode) => saved.enabledViews!.includes(mode))
      : defaults.enabledViews
    return {
      enabledViews: enabledViews.length ? enabledViews : defaults.enabledViews,
      fontSize: [12, 13, 15].includes(saved?.fontSize ?? 0) ? saved!.fontSize! : defaults.fontSize,
    }
  } catch {
    return defaults
  }
}

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
      className="preferences-dialog"
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
      <div className="preferences-heading">
        <h2 id="preferences-title">Preferences</h2>
        <button className="icon-button" aria-label="Close preferences" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="preferences-tabs" role="tablist" aria-label="Preference sections">
        {(["general", "shortcuts"] as const).map((id) => (
          <button
            key={id}
            id={`preferences-tab-${id}`}
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
        className="preferences-panel"
        id="preferences-panel-general"
        role="tabpanel"
        aria-labelledby="preferences-tab-general"
        hidden={tab !== "general"}
        tabIndex={0}
      >
        <label className="preference-row" htmlFor="font-size">
          <span>Terminal text size</span>
          <select
            id="font-size"
            value={value.fontSize}
            onChange={(event) => onChange({ ...value, fontSize: Number(event.target.value) })}
          >
            <option value={12}>12px</option>
            <option value={13}>13px</option>
            <option value={15}>15px</option>
          </select>
        </label>
        <fieldset className="view-preferences">
          <legend>View modes</legend>
          <div className="view-preference-options">
            {viewModes.map((mode) => {
              const checked = value.enabledViews.includes(mode)
              return (
                <label key={mode}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && value.enabledViews.length === 1}
                    onChange={() =>
                      onChange({
                        ...value,
                        enabledViews: viewModes.filter((item) =>
                          item === mode ? !checked : value.enabledViews.includes(item),
                        ),
                      })
                    }
                  />
                  <span>{mode === "focus" ? "Focus" : mode === "grid" ? "Grid" : "Canvas"}</span>
                </label>
              )
            })}
          </div>
          <p>Keep at least one view enabled.</p>
        </fieldset>
      </div>
      <div
        className="preferences-panel"
        id="preferences-panel-shortcuts"
        role="tabpanel"
        aria-labelledby="preferences-tab-shortcuts"
        hidden={tab !== "shortcuts"}
        tabIndex={0}
      >
        <dl className="shortcut-list">
          <div>
            <dt>Find a terminal</dt>
            <dd>
              <kbd>{modifier}</kbd>
              <kbd>K</kbd>
            </dd>
          </div>
          <div>
            <dt>Open preferences</dt>
            <dd>
              <kbd>{modifier}</kbd>
              <kbd>,</kbd>
            </dd>
          </div>
        </dl>
      </div>
    </dialog>
  )
}
