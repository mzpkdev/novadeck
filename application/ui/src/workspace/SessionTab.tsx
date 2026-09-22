import { useSortable } from "@dnd-kit/react/sortable"
import { Check, Pencil, Terminal as TerminalIcon, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import type { Session } from "./sessions"

export const SessionTab = ({
  session,
  index,
  selected,
  onSelect,
  onRename,
  onClose,
}: {
  session: Session
  index: number
  selected: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onClose: () => void
}): React.JSX.Element => {
  const [editing, setEditing] = useState(false)
  const { ref, handleRef, isDragSource } = useSortable({
    id: session.id,
    index,
    disabled: editing,
    transition: { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  })
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
    <div
      ref={ref}
      data-session-id={session.id}
      className={`session-tab ${selected ? "selected" : ""} ${editing ? "editing" : ""} ${isDragSource ? "dragging" : ""}`}
    >
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
          ref={handleRef}
          className="session-select"
          aria-label={`Select ${session.name}`}
          aria-current={selected ? "true" : undefined}
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
