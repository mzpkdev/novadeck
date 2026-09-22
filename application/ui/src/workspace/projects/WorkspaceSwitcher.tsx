import { Check, ChevronDown, Folder, FolderPlus } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import type { Project } from "../model/types"

type WorkspaceSwitcherProps = {
  projects: Project[]
  current: Project
  onSelect: (id: string) => void
  onCreate: (name: string) => void
}

export const WorkspaceSwitcher = ({
  projects,
  current,
  onSelect,
  onCreate,
}: WorkspaceSwitcherProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const popupId = useId()

  const dismiss = useCallback((restoreFocus = true): void => {
    setOpen(false)
    setCreating(false)
    setName("")
    if (restoreFocus) trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    const outside = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) dismiss(false)
    }
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        dismiss()
      }
    }

    document.addEventListener("pointerdown", outside)
    document.addEventListener("keydown", keydown)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("keydown", keydown)
    }
  }, [open, dismiss])

  useEffect(() => {
    if (creating) input.current?.focus()
  }, [creating])

  const submit = (): void => {
    const projectName = name.trim()
    if (!projectName) return
    onCreate(projectName)
    dismiss()
  }

  return (
    <div
      className="workspace-switcher relative min-w-0 w-fit max-w-[200px] flex-[0_1_auto] max-[700px]:max-w-[130px]"
      ref={root}
    >
      <button
        ref={trigger}
        className="workspace-switcher-trigger inline-flex min-h-9 min-w-0 w-full max-w-full items-center gap-1.5 rounded-control px-2.5 text-[12px] leading-[1.5] font-medium text-ink transition-[background] duration-(--motion-feedback) hover:bg-soft aria-expanded:bg-soft"
        type="button"
        aria-label="Switch workspace"
        aria-controls={popupId}
        aria-expanded={open}
        title={current.directory}
        onClick={() => {
          if (open) dismiss()
          else setOpen(true)
        }}
      >
        <Folder aria-hidden="true" className="shrink-0 text-muted" size={14} strokeWidth={1.55} />
        <span className="min-w-0 flex-1 truncate">{current.name}</span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 text-muted"
          size={14}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <section
          id={popupId}
          className="workspace-switcher-menu absolute top-[calc(100%+10px)] left-0 z-40 w-[min(280px,calc(100vw-24px))] overflow-hidden rounded-popover border border-line bg-paper text-ink shadow-floating max-[700px]:fixed max-[700px]:top-[54px] max-[700px]:left-3"
          role="dialog"
          aria-label="Switch workspace"
        >
          {creating ? (
            <form
              className="workspace-switcher-create grid gap-3 p-3.5"
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <label className="text-[11px] font-medium text-ink" htmlFor={`${popupId}-name`}>
                New workspace
              </label>
              <input
                ref={input}
                className="w-full rounded-control border border-line bg-paper px-2.25 py-2 text-[12px] text-ink placeholder:text-muted"
                id={`${popupId}-name`}
                value={name}
                maxLength={60}
                placeholder="Workspace name"
                onChange={(event) => setName(event.target.value)}
              />
              <div className="workspace-switcher-create-actions flex justify-end gap-1.5">
                <button
                  className="min-h-[29px] rounded-control border border-line bg-paper shadow-control px-2.5 text-[11px] text-ink hover:bg-soft disabled:text-muted disabled:opacity-55"
                  type="submit"
                  disabled={!name.trim()}
                >
                  Create
                </button>
                <button
                  className="min-h-[29px] rounded-control border border-line bg-paper shadow-control px-2.5 text-[11px] text-ink hover:bg-soft"
                  type="button"
                  onClick={() => {
                    setCreating(false)
                    setName("")
                    requestAnimationFrame(() => createButton.current?.focus())
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div
                className="workspace-switcher-projects flex max-h-[min(280px,calc(100vh-150px))] flex-col gap-1 overflow-y-auto p-[5px]"
                aria-label="Workspaces"
              >
                {projects.map((project) => {
                  const selected = project.id === current.id
                  return (
                    <button
                      key={project.id}
                      className={`workspace-switcher-project flex w-full min-w-0 items-center gap-3 rounded-control border border-transparent px-2.5 py-[9px] text-left text-ink hover:bg-shell focus-visible:bg-shell focus-visible:outline-offset-[-2px] ${selected ? "selected" : ""}`}
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      title={project.directory}
                      onClick={() => {
                        onSelect(project.id)
                        dismiss()
                      }}
                    >
                      <span className="workspace-switcher-project-copy flex min-w-0 flex-1 flex-col gap-0.75">
                        <strong className="truncate text-[12px] font-medium">{project.name}</strong>
                        <small className="truncate font-mono text-[10px] text-muted">
                          {project.directory}
                        </small>
                      </span>
                      {selected && (
                        <Check
                          aria-label="Current workspace"
                          className="shrink-0"
                          size={15}
                          strokeWidth={1.8}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="workspace-switcher-footer border-t border-line p-[5px]">
                <button
                  ref={createButton}
                  className="workspace-switcher-new flex w-full items-center gap-2.25 rounded-control px-2.5 py-[9px] text-left text-[11px] text-muted hover:bg-soft hover:text-ink focus-visible:bg-soft focus-visible:text-ink"
                  type="button"
                  onClick={() => setCreating(true)}
                >
                  <FolderPlus
                    aria-hidden="true"
                    className="shrink-0"
                    size={15}
                    strokeWidth={1.65}
                  />
                  <span>Create workspace</span>
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
