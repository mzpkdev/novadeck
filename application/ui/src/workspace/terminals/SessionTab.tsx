import { useSortable } from "@dnd-kit/react/sortable"
import { Check, Eye, EyeOff, Pencil, Terminal as TerminalIcon, X } from "lucide-react"
import { useState } from "react"

import { Editable } from "../../ui-toolkit/Editable"
import { Tooltip } from "../../ui-toolkit/Tooltip"
import type { Session } from "../model/types"
import { SidebarItem } from "../sidebar/SidebarItem"

const actionClasses =
  "session-action flex size-6 shrink-0 items-center justify-center rounded-control p-1.5 text-muted hover:bg-soft hover:text-ink [&>svg]:opacity-25 [&>svg]:transition-opacity [&>svg]:duration-(--motion-feedback) [&>svg]:ease-interface hover:[&>svg]:opacity-100 focus-visible:[&>svg]:opacity-100"

export const SessionTab = ({
  session,
  index,
  selected,
  hidden,
  onVisibilityChange,
  onSelect,
  onRename,
  onClose,
}: {
  session: Session
  index: number
  selected: boolean
  hidden: boolean
  onVisibilityChange: (hidden: boolean) => void
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
        selectLabel={`Select ${session.name}${hidden ? " (hidden)" : ""}`}
        tooltip={`${session.name}\n${session.directory} · ${session.command}`}
        onSelect={onSelect}
        data-session-id={session.id}
        data-terminal-hidden={hidden}
        className={`session-tab [&_.sidebar-item-detail]:pr-[76px] ${hidden ? "[&_.sidebar-item-select]:opacity-50" : ""} ${selected ? "selected" : ""} ${editing ? "editing" : ""} ${isDragSource ? "dragging" : ""}`}
        editing={editing}
        editor={
          <Editable.Area
            hidden={!editing}
            className="session-rename flex min-w-0 flex-1 items-start px-2.5 py-1.5 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-line [&_input]:bg-paper [&_input]:px-1.5 [&_input]:py-0.5 [&_input]:text-[12px] [&_input]:leading-[18px] [&_input]:text-ink"
          >
            <Editable.Input aria-label={`Rename ${session.name}`} />
          </Editable.Area>
        }
        actions={
          <div className="session-actions flex items-center">
            <Tooltip content={`${hidden ? "Show" : "Hide"} ${session.name} in Grid and Canvas`}>
              <button
                className={`${actionClasses} ${hidden ? "[&>svg]:opacity-100!" : ""}`}
                aria-label={`${hidden ? "Show" : "Hide"} ${session.name} in Grid and Canvas`}
                aria-pressed={hidden}
                onClick={() => onVisibilityChange(!hidden)}
              >
                {hidden ? (
                  <EyeOff size={13} strokeWidth={1.5} />
                ) : (
                  <Eye size={13} strokeWidth={1.5} />
                )}
              </button>
            </Tooltip>
            {editing ? (
              <Editable.SubmitTrigger
                className={actionClasses}
                aria-label={`Save name for ${session.name}`}
                tooltip="Save name"
              >
                <Check size={13} strokeWidth={1.5} />
              </Editable.SubmitTrigger>
            ) : (
              <Editable.EditTrigger
                className={actionClasses}
                aria-label={`Rename ${session.name}`}
                tooltip="Rename terminal"
              >
                <Pencil size={13} strokeWidth={1.5} />
              </Editable.EditTrigger>
            )}
            <Tooltip content="Close terminal">
              <button
                className={actionClasses}
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
