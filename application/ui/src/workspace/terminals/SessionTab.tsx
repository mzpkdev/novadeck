import { useSortable } from "@dnd-kit/react/sortable"
import { Check, Pencil, Terminal as TerminalIcon, X } from "lucide-react"
import { useState } from "react"

import { Editable } from "../../ui-toolkit/Editable"
import { Tooltip } from "../../ui-toolkit/Tooltip"
import type { Session } from "../model/types"
import { SidebarItem } from "../sidebar/SidebarItem"

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
  return (
    <Editable.Root
      value={session.name}
      onCommit={onRename}
      onEditingChange={setEditing}
      maxLength={60}
    >
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
        editing={editing}
        editor={
          <Editable.Area
            hidden={!editing}
            className="session-rename flex min-w-0 flex-1 items-start px-2.5 py-2 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-line [&_input]:bg-paper [&_input]:px-1.5 [&_input]:py-1 [&_input]:text-[12px] [&_input]:text-ink"
          >
            <Editable.Input aria-label={`Rename ${session.name}`} />
          </Editable.Area>
        }
        actions={
          <div className="session-actions flex items-center">
            {editing ? (
              <Editable.SubmitTrigger
                className="session-action flex size-6 shrink-0 items-center justify-center rounded-control p-1.5 text-muted hover:bg-soft hover:text-ink"
                aria-label={`Save name for ${session.name}`}
                tooltip="Save name"
              >
                <Check size={13} strokeWidth={1.5} />
              </Editable.SubmitTrigger>
            ) : (
              <Editable.EditTrigger
                className="session-action flex size-6 shrink-0 items-center justify-center rounded-control p-1.5 text-muted hover:bg-soft hover:text-ink"
                aria-label={`Rename ${session.name}`}
                tooltip="Rename terminal"
              >
                <Pencil size={13} strokeWidth={1.5} />
              </Editable.EditTrigger>
            )}
            <Tooltip content="Close terminal">
              <button
                className="session-action flex size-6 shrink-0 items-center justify-center rounded-control p-1.5 text-muted hover:bg-soft hover:text-ink"
                aria-label={`Close ${session.name}`}
                onClick={onClose}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </Tooltip>
          </div>
        }
      />
    </Editable.Root>
  )
}
