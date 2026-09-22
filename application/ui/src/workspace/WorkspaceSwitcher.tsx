import { Check, ChevronDown, FolderPlus } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import "./WorkspaceSwitcher.css"

export type Project = {
  id: string
  name: string
  directory: string
}

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
    <div className="workspace-switcher" ref={root}>
      <button
        ref={trigger}
        className="workspace-switcher-trigger"
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
        <span>{current.name}</span>
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <section
          id={popupId}
          className="workspace-switcher-menu"
          role="dialog"
          aria-label="Switch workspace"
        >
          {creating ? (
            <form
              className="workspace-switcher-create"
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <label htmlFor={`${popupId}-name`}>New workspace</label>
              <input
                ref={input}
                id={`${popupId}-name`}
                value={name}
                maxLength={60}
                placeholder="Workspace name"
                onChange={(event) => setName(event.target.value)}
              />
              <div className="workspace-switcher-create-actions">
                <button type="submit" disabled={!name.trim()}>
                  Create
                </button>
                <button
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
              <div className="workspace-switcher-projects" aria-label="Workspaces">
                {projects.map((project) => {
                  const selected = project.id === current.id
                  return (
                    <button
                      key={project.id}
                      className={`workspace-switcher-project${selected ? " selected" : ""}`}
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      title={project.directory}
                      onClick={() => {
                        onSelect(project.id)
                        dismiss()
                      }}
                    >
                      <span className="workspace-switcher-project-copy">
                        <strong>{project.name}</strong>
                        <small>{project.directory}</small>
                      </span>
                      {selected && (
                        <Check aria-label="Current workspace" size={15} strokeWidth={1.8} />
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="workspace-switcher-footer">
                <button
                  ref={createButton}
                  className="workspace-switcher-new"
                  type="button"
                  onClick={() => setCreating(true)}
                >
                  <FolderPlus aria-hidden="true" size={15} strokeWidth={1.65} />
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
