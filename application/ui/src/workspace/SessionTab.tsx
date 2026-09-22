import { useSortable } from "@dnd-kit/react/sortable"
import { Check, Pencil, Terminal as TerminalIcon, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import type { Session } from "./sessions"
import { SidebarItem } from "./SidebarItem"

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
    <SidebarItem
      ref={ref}
      handleRef={handleRef}
      name={session.name}
      icon={<TerminalIcon size={14} strokeWidth={1.5} />}
      detail={<span className="session-process truncate font-mono">{session.command}</span>}
      selected={selected}
      selectLabel={`Select ${session.name}`}
      tooltip={`${session.name}\n${session.directory} · ${session.command}`}
      onSelect={onSelect}
      data-session-id={session.id}
      className={`session-tab ${selected ? "selected" : ""} ${editing ? "editing" : ""} ${isDragSource ? "dragging" : ""}`}
      editor={
        editing ? (
          <form
            className="session-rename flex min-w-0 flex-1 items-start px-2.5 py-2 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-line [&_input]:bg-paper [&_input]:px-1.5 [&_input]:py-1 [&_input]:text-[12px] [&_input]:text-ink"
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
                if (!(event.relatedTarget as HTMLElement | null)?.closest(".session-actions"))
                  save()
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
        ) : undefined
      }
      actions={
        <div className="session-actions flex items-center">
          <button
            className="session-action flex size-6 shrink-0 items-center justify-center rounded-control p-1.5 text-muted hover:bg-soft hover:text-ink"
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
            className="session-action flex size-6 shrink-0 items-center justify-center rounded-control p-1.5 text-muted hover:bg-soft hover:text-ink"
            aria-label={`Close ${session.name}`}
            title="Close terminal"
            onClick={onClose}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      }
    />
  )
}
