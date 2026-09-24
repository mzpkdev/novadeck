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
  placing = false,
  onVisibilityChange,
  onSelect,
  onRename,
  onClose,
}: {
  session: Session
  index: number
  selected: boolean
  hidden: boolean
  placing?: boolean
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
        data-placing={placing}
        {...(placing
          ? { description: "Placement active. Press Escape to cancel and remove this terminal." }
          : {})}
        className={`session-tab data-[placing=true]:border-dashed data-[placing=true]:border-line-strong! data-[placing=true]:bg-soft! [--sidebar-actions-space:76px] ${hidden ? "[&_.sidebar-item-select]:opacity-50" : ""} ${selected ? "selected" : ""} ${editing ? "editing" : ""} ${isDragSource ? "dragging" : ""}`}
        editing={editing}
        editor={
          <Editable.Area
            hidden={!editing}
            className="session-rename flex min-w-0 flex-1 items-start gap-2 px-2.5 py-[9px]"
          >
            <span className="sidebar-item-icon flex h-[18px] w-3.5 shrink-0 items-center justify-center text-muted">
              <TerminalIcon size={14} strokeWidth={1.5} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Editable.Input
                aria-label={`Rename ${session.name}`}
                className="w-full border-0 bg-transparent p-0 text-[12px] leading-[18px] font-medium text-ink shadow-none outline-none"
              />
              <span className="sidebar-item-detail flex h-6 min-w-0 items-center overflow-hidden pr-(--sidebar-actions-space) whitespace-nowrap text-[10px] leading-[18px] text-muted">
                <span className="session-process truncate font-mono">{session.command}</span>
              </span>
            </div>
          </Editable.Area>
        }
        actions={
          <div className="session-actions flex items-center">
            <Tooltip content={hidden ? "Show" : "Hide"}>
              <button
                className={`${actionClasses} disabled:pointer-events-none disabled:opacity-50 ${hidden ? "[&>svg]:opacity-100!" : ""}`}
                aria-label={`${hidden ? "Show" : "Hide"} ${session.name} in Grid and Canvas`}
                aria-pressed={hidden}
                disabled={editing}
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
                tooltip="Save"
              >
                <Check size={13} strokeWidth={1.5} />
              </Editable.SubmitTrigger>
            ) : (
              <Editable.EditTrigger
                className={actionClasses}
                aria-label={`Rename ${session.name}`}
                tooltip="Rename"
              >
                <Pencil size={13} strokeWidth={1.5} />
              </Editable.EditTrigger>
            )}
            {editing ? (
              <Editable.CancelTrigger
                className={actionClasses}
                aria-label={`Cancel renaming ${session.name}`}
                tooltip="Cancel"
              >
                <X size={14} strokeWidth={1.5} />
              </Editable.CancelTrigger>
            ) : (
              <Tooltip content="Close">
                <button
                  className={actionClasses}
                  aria-label={`Close ${session.name}`}
                  onClick={onClose}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </Tooltip>
            )}
          </div>
        }
      />
    </Editable.Root>
  )
}
