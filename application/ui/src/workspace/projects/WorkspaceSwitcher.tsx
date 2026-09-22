import { Check, ChevronDown, Folder, FolderPlus } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { Popover } from "../../ui-toolkit/Popover"
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
  const input = useRef<HTMLInputElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const popupId = useId()

  const changeOpen = (next: boolean): void => {
    setOpen(next)
    if (!next) {
      setCreating(false)
      setName("")
    }
  }

  useEffect(() => {
    if (creating) input.current?.focus()
  }, [creating])

  const submit = (): void => {
    const projectName = name.trim()
    if (!projectName) return
    onCreate(projectName)
    changeOpen(false)
  }

  return (
    <div className="workspace-switcher relative min-w-0 w-fit max-w-[200px] flex-[0_1_auto] max-[700px]:max-w-[130px]">
      <Popover
        label="Switch workspace"
        open={open}
        onOpenChange={changeOpen}
        className="workspace-switcher-menu w-[min(280px,calc(100vw-24px))]"
        trigger={
          <button
            className="workspace-switcher-trigger inline-flex min-h-9 min-w-0 w-full max-w-full items-center gap-1.5 rounded-control px-2.5 text-[12px] leading-[1.5] font-medium text-ink transition-[background] duration-(--motion-feedback) hover:bg-soft aria-expanded:bg-soft"
            type="button"
            aria-label="Switch workspace"
            title={current.directory}
          >
            <Folder
              aria-hidden="true"
              className="shrink-0 text-muted"
              size={14}
              strokeWidth={1.55}
            />
            <span className="min-w-0 flex-1 truncate">{current.name}</span>
            <ChevronDown
              aria-hidden="true"
              className="shrink-0 text-muted"
              size={14}
              strokeWidth={1.75}
            />
          </button>
        }
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
                      changeOpen(false)
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
                <FolderPlus aria-hidden="true" className="shrink-0" size={15} strokeWidth={1.65} />
                <span>Create workspace</span>
              </button>
            </div>
          </>
        )}
      </Popover>
    </div>
  )
}
