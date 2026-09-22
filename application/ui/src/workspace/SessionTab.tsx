import { Check, Pencil, Terminal as TerminalIcon, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import type { Session } from "./sessions"

export const SessionTab = ({
  session,
  selected,
  onSelect,
  onRename,
  onClose,
}: {
  session: Session
  selected: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onClose: () => void
}): React.JSX.Element => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.name)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) {
      input.current?.focus()
      input.current?.select()
    }
  }, [editing])
  const save = (): void => {
    const name = draft.trim()
    if (name) onRename(name)
    setEditing(false)
  }
  return (
    <div className={`session-tab ${selected ? "selected" : ""} ${editing ? "editing" : ""}`}>
      {editing ? (
        <form
          className="session-rename"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <input
            ref={input}
            aria-label={`Rename ${session.name}`}
            value={draft}
            maxLength={60}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              if (!(event.relatedTarget as HTMLElement | null)?.closest(".session-actions")) save()
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                setEditing(false)
              }
            }}
          />
        </form>
      ) : (
        <button
          className="session-select"
          aria-label={`Select ${session.name}`}
          aria-pressed={selected}
          title={`${session.directory} · ${session.command}`}
          onClick={onSelect}
        >
          <TerminalIcon size={16} strokeWidth={1.5} />
          <span className="session-tab-copy">
            <strong>{session.name}</strong>
            <span>{session.command}</span>
          </span>
        </button>
      )}
      <div className="session-controls">
        <span className="session-rest-state" aria-hidden="true">
          {session.state === "running" ? (
            <span className="status-dot" title="Running" />
          ) : (
            <span className="session-index">{session.id}</span>
          )}
        </span>
        <div className="session-actions">
          <button
            className="session-action"
            aria-label={editing ? `Save name for ${session.name}` : `Rename ${session.name}`}
            title={editing ? "Save name" : "Rename terminal"}
            onClick={() => {
              if (editing) save()
              else {
                setDraft(session.name)
                setEditing(true)
              }
            }}
          >
            {editing ? (
              <Check size={13} strokeWidth={1.5} />
            ) : (
              <Pencil size={13} strokeWidth={1.5} />
            )}
          </button>
          <button
            className="session-action"
            aria-label={`Close ${session.name}`}
            title="Close terminal"
            onClick={onClose}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
