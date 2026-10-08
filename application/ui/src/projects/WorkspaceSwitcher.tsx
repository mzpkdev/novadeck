import {
  Accessibility,
  Cursor,
  Feedback,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { Check, ChevronDown, Folder, FolderOpen, Pin, PinOff, Trash2 } from "lucide-react"
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { Project } from "../model/types"
import { ConfirmDialog } from "../ui-toolkit/ConfirmDialog"
import { Popover } from "../ui-toolkit/Popover"
import { Tooltip } from "../ui-toolkit/Tooltip"
import {
  arrangeProjects,
  canPin,
  moveProject,
  noArrangement,
  togglePin,
  type ProjectArrangement,
} from "./project-arrangement"
import { elsewhereStatus, type ProjectStatus } from "./project-status"

const noStatuses: Readonly<Record<string, ProjectStatus>> = {}
const noIds: readonly string[] = []

// A project's status in words, for assistive technology; on screen it's only a mark.
const statusText: Record<ProjectStatus, string> = {
  question: "Asks a question",
  attention: "Needs you",
  failed: "Failed · reply unread",
  done: "Done · reply unread",
  running: "Working",
}

// A row follows the pointer once it has moved a few pixels, so a click still selects it;
// the keyboard moves rows with Alt and the arrows instead, so dnd-kit adds no keyboard
// sensor and none of its screen reader markup.
const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 6 })],
  }),
]
const feedback = Feedback.configure({
  dropAnimation: { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
})
const cursor = Cursor.configure({ cursor: "grabbing" })

type WorkspaceSwitcherProps = {
  projects: Project[]
  current: Project
  // What each project's terminals show, by its id, where they show anything.
  statuses?: Readonly<Record<string, ProjectStatus>> | undefined
  // How the person arranged the projects, and how to change it; without `onArrange` the
  // switcher offers no pinning or reordering.
  arrangement?: ProjectArrangement | undefined
  onArrange?:
    | ((change: (arrangement: ProjectArrangement) => ProjectArrangement) => void)
    | undefined
  // Projects the button's dot leaves out, as the header shows their status itself.
  dotIgnores?: readonly string[] | undefined
  onSelect: (id: string) => void
  // Absent where no folder can be opened, which disables "Open folder…".
  onOpenFolder?: (() => void) | undefined
  // Removes a project after the person confirms; absent where projects can't be removed.
  onRemove?: ((id: string) => void) | undefined
}

export const WorkspaceSwitcher = ({
  projects,
  current,
  statuses = noStatuses,
  arrangement = noArrangement,
  onArrange,
  dotIgnores = noIds,
  onSelect,
  onOpenFolder,
  onRemove,
}: WorkspaceSwitcherProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  // The project waiting on the person's answer to removing it.
  const [removing, setRemoving] = useState<Project | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  // The last project stays: the workspace always has one.
  const removable = Boolean(onRemove) && projects.length > 1
  // The projects as listed: the pinned ones, then the rest.
  const { pinned, rest } = arrangeProjects(projects, arrangement)
  const listed = [...pinned, ...rest]
  const pinAvailable = canPin(projects, arrangement)
  // The list that holds the rows, which a drag stays within.
  const [list, setList] = useState<HTMLDivElement | null>(null)
  const modifiers = useMemo(() => [RestrictToElement.configure({ element: list })], [list])
  // The row a keyboard move keeps the focus on; a new object asks again.
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null)
  // dnd-kit moves the dragged row's element among its neighbours as it goes, never the
  // label or the rule, and puts it back only in some drags; every drag's end remounts
  // the list, so it is rebuilt from the arrangement.
  const [dragged, setDragged] = useState(0)
  // Where the list was scrolled as the drag ended: the remount empties it for a moment,
  // which scrolls it back to the top, so it is put back before the next paint.
  const scrolledTo = useRef<{ readonly list: HTMLElement; readonly top: number } | null>(null)
  useLayoutEffect(() => {
    const at = scrolledTo.current
    if (at) at.list.scrollTop = at.top
    scrolledTo.current = null
  })
  // What another project has waiting on the person, marked on the button.
  const elsewhere = elsewhereStatus(
    Object.fromEntries(Object.entries(statuses).filter(([id]) => !dotIgnores.includes(id))),
    current.id,
  )
  return (
    <div className="workspace-switcher relative min-w-0 w-fit max-w-[200px] flex-[0_1_auto] max-[700px]:max-w-[130px]">
      <Popover
        tooltip={current.directory}
        label="Switch workspace"
        open={open}
        onOpenChange={setOpen}
        className="workspace-switcher-menu w-[min(280px,calc(100vw-24px))]"
        trigger={
          <button
            ref={trigger}
            className="button ghost workspace-switcher-trigger relative inline-flex min-h-9 min-w-0 w-full max-w-full items-center justify-start gap-1.5 px-[9px] text-body leading-[1.5] font-medium"
            type="button"
            aria-label="Switch workspace"
            aria-description={elsewhere && `Another project: ${statusText[elsewhere]}`}
            data-project-status={elsewhere}
          >
            {elsewhere && <span aria-hidden="true" className="workspace-switcher-dot" />}
            <Folder aria-hidden="true" className="shrink-0" size={14} strokeWidth={1.55} />
            <span className="min-w-0 flex-1 truncate">{current.name}</span>
            <ChevronDown aria-hidden="true" className="shrink-0" size={14} strokeWidth={1.75} />
          </button>
        }
      >
        <div
          className="workspace-switcher-projects flex max-h-[min(560px,calc(100vh-150px))] flex-col gap-1 overflow-y-auto p-[5px]"
          aria-label="Workspaces"
          ref={setList}
        >
          <DragDropProvider
            key={dragged}
            sensors={sensors}
            modifiers={modifiers}
            plugins={(defaults) => [
              ...defaults.filter((plugin) => plugin !== Accessibility),
              feedback,
              cursor,
            ]}
            onDragEnd={(event) => {
              if (list) scrolledTo.current = { list, top: list.scrollTop }
              setDragged((count) => count + 1)
              if (event.canceled) return
              const { source } = event.operation
              if (!isSortable(source) || source.initialIndex === source.index) return
              const { id, index } = source
              onArrange?.((before) => moveProject(projects, before, String(id), index))
            }}
          >
            {pinned.length > 0 && (
              <div className="workspace-switcher-label section-label px-2.5 pt-1 pb-0.5 text-label font-medium">
                Pinned
              </div>
            )}
            {listed.map((project, index) => (
              <Fragment key={project.id}>
                {pinned.length > 0 && index === pinned.length && rest.length > 0 && (
                  <hr className="workspace-switcher-rule" />
                )}
                <ProjectRow
                  project={project}
                  index={index}
                  selected={project.id === current.id}
                  status={statuses[project.id]}
                  pinned={index < pinned.length}
                  pinnable={Boolean(onArrange)}
                  pinBlocked={!pinAvailable}
                  removable={removable}
                  focusRequest={focusRequest}
                  onFocused={() => setFocusRequest(null)}
                  onSelect={() => {
                    onSelect(project.id)
                    setOpen(false)
                  }}
                  onTogglePin={() =>
                    onArrange?.((before) => togglePin(projects, before, project.id))
                  }
                  onMove={(by) => {
                    if (!onArrange) return
                    setFocusRequest({ id: project.id })
                    // Across the rule it pins or unpins in place, rather than skipping a row.
                    const crossing =
                      by === 1 ? index === pinned.length - 1 : index === pinned.length
                    onArrange((before) =>
                      crossing
                        ? togglePin(projects, before, project.id)
                        : moveProject(projects, before, project.id, index + by),
                    )
                  }}
                  onRemove={() => {
                    setOpen(false)
                    setRemoving(project)
                  }}
                />
              </Fragment>
            ))}
          </DragDropProvider>
        </div>
        {/* A disabled button takes no pointer, so its footer says why it's unavailable. */}
        <Tooltip content="Unavailable" disabled={Boolean(onOpenFolder)}>
          <div className="workspace-switcher-footer p-[5px]">
            <button
              className="button quiet workspace-switcher-new h-auto w-full justify-start gap-2.25 px-[9px] py-2 text-left text-control disabled:cursor-not-allowed"
              type="button"
              disabled={!onOpenFolder}
              onClick={() => {
                setOpen(false)
                onOpenFolder?.()
              }}
            >
              <FolderOpen aria-hidden="true" className="shrink-0" size={15} strokeWidth={1.65} />
              <span>Open folder…</span>
            </button>
          </div>
        </Tooltip>
      </Popover>
      <ConfirmDialog
        subject={removing}
        title={(shown) => `Remove “${shown.name}”?`}
        description={() => "Its terminals close. The folder on disk stays as it is."}
        confirmLabel="Remove project"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (removing) onRemove?.(removing.id)
          setRemoving(null)
        }}
        onCancel={() => setRemoving(null)}
        returnFocus={() => trigger.current}
        widthClassName="w-[min(360px,calc(100vw-32px))]"
      />
    </div>
  )
}

// One project's row in the list: its button, and the pin and remove buttons that show
// beside it while the pointer or the focus is on the row.
const ProjectRow = ({
  project,
  index,
  selected,
  status,
  pinned,
  pinnable,
  pinBlocked,
  removable,
  focusRequest,
  onFocused,
  onSelect,
  onTogglePin,
  onMove,
  onRemove,
}: {
  project: Project
  // Its place in the list, pinned ones first.
  index: number
  selected: boolean
  status: ProjectStatus | undefined
  pinned: boolean
  // Whether the row can be pinned and moved at all.
  pinnable: boolean
  // No more projects can be pinned.
  pinBlocked: boolean
  removable: boolean
  // Asks the row with this id to take the focus, as after a keyboard move.
  focusRequest: { id: string } | null
  // Told once the row has taken the focus it was asked for.
  onFocused: () => void
  onSelect: () => void
  onTogglePin: () => void
  // Moves the project by this many places.
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}): React.JSX.Element => {
  const { ref, handleRef, isDragSource } = useSortable({
    id: project.id,
    index,
    disabled: !pinnable,
    transition: { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  })
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focusRequest?.id !== project.id) return
    button.current?.focus()
    onFocused()
  }, [focusRequest, project.id, onFocused])
  const pinTitle = pinned ? "Unpin project" : "Pin project"
  const pinDisabled = pinBlocked && !pinned
  // Room at the row's right for the buttons that show there.
  const reserve = (pinnable ? 1 : 0) + (removable ? 1 : 0)
  return (
    <div
      ref={ref}
      className="workspace-switcher-row group relative"
      data-pinned={pinned ? "true" : undefined}
      data-dragging={isDragSource ? "true" : undefined}
    >
      <Tooltip content={project.directory} placement="right-start">
        <button
          ref={(node) => {
            button.current = node
            handleRef(node)
          }}
          aria-keyshortcuts={pinnable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
          className={`item standalone workspace-switcher-project flex w-full min-w-0 items-center gap-3 px-2.5 py-[9px] text-left ${reserve === 2 ? "pr-[70px]" : reserve === 1 ? "pr-10" : ""} ${selected ? "selected" : ""}`}
          type="button"
          aria-current={selected ? "true" : undefined}
          aria-description={status && statusText[status]}
          data-project-status={status}
          onClick={onSelect}
          onKeyDown={(event) => {
            if (!pinnable || !event.altKey) return
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
            event.preventDefault()
            onMove(event.key === "ArrowUp" ? -1 : 1)
          }}
        >
          <span className="workspace-switcher-project-copy flex min-w-0 flex-1 flex-col gap-0.75">
            <strong className="flex min-w-0 items-center gap-1.5 text-body font-medium">
              <span className="truncate">{project.name}</span>
              {pinned && (
                <Pin
                  aria-label="Pinned"
                  className="workspace-switcher-pinned shrink-0"
                  size={11}
                  strokeWidth={1.8}
                />
              )}
            </strong>
            <small className="item-detail truncate text-caption">{project.directory}</small>
          </span>
          {selected && (
            <Check
              aria-label="Current workspace"
              className="shrink-0"
              size={15}
              strokeWidth={1.8}
            />
          )}
          {status && <span aria-hidden="true" className="workspace-switcher-status shrink-0" />}
        </button>
      </Tooltip>
      {pinnable && (
        <Tooltip content={pinDisabled ? "Unpin a project first" : pinTitle}>
          {/* A disabled button takes no pointer, so its wrapper carries the tooltip. */}
          <span
            className={`absolute top-1/2 -translate-y-1/2 ${removable ? "right-[38px]" : "right-1.5"}`}
          >
            <button
              className="icon-button workspace-switcher-action size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              type="button"
              aria-label={`${pinned ? "Unpin" : "Pin"} ${project.name}`}
              disabled={pinDisabled}
              onClick={onTogglePin}
            >
              {pinned ? (
                <PinOff aria-hidden="true" size={14} strokeWidth={1.65} />
              ) : (
                <Pin aria-hidden="true" size={14} strokeWidth={1.65} />
              )}
            </button>
          </span>
        </Tooltip>
      )}
      {removable && (
        <Tooltip content="Remove project">
          <button
            className="icon-button workspace-switcher-action absolute top-1/2 right-1.5 size-7 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            type="button"
            aria-label={`Remove ${project.name}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" size={14} strokeWidth={1.65} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
