import { useLayoutEffect, useRef, useState } from "react"

import { Tooltip } from "../ui-toolkit/Tooltip"
import { chipsThatFit } from "./project-chip-fit"
import { needsPerson, type ProjectStatus } from "./project-status"

const statusText: Record<ProjectStatus, string> = {
  question: "Asks a question",
  attention: "Needs you",
  failed: "Failed · reply unread",
  done: "Done · reply unread",
  running: "Working",
}

// The pinned projects other than the current one, as quiet text chips after the switcher:
// each marks what its project's terminals show, and a click switches to it. They take the
// room the header leaves them: each shows whole or not at all, the last ones first to go,
// and `onShown` says which show. All stay in the group so each can be measured; the ones
// that don't fit are hidden and inert. With none showing, the rule goes too.
export const ProjectChips = ({
  projects,
  statuses,
  onSelect,
  onShown,
}: {
  projects: readonly { readonly id: string; readonly name: string; readonly directory: string }[]
  // What each project's terminals show, by its id, where they show anything.
  statuses: Readonly<Record<string, ProjectStatus>>
  onSelect: (id: string) => void
  onShown: (ids: readonly string[]) => void
}): React.JSX.Element | null => {
  const group = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(projects.length)
  const shown = Math.min(count, projects.length)

  // Measures before paint, and again as the group or a chip changes size.
  useLayoutEffect(() => {
    const element = group.current
    if (!element || projects.length === 0) return
    const measure = (): void => {
      const style = getComputedStyle(element)
      const available =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const widths = [...element.querySelectorAll<HTMLElement>(".project-chip")].map(
        (chip) => chip.offsetWidth,
      )
      setCount(chipsThatFit(available, widths, parseFloat(style.columnGap) || 0))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const chip of element.querySelectorAll(".project-chip")) observer.observe(chip)
    return () => observer.disconnect()
  }, [projects])

  const shownIds = projects.slice(0, shown).map(({ id }) => id)
  const key = shownIds.join("\n")
  useLayoutEffect(() => {
    onShown(key ? key.split("\n") : [])
  }, [key, onShown])

  if (projects.length === 0) return null
  return (
    <div
      ref={group}
      role="group"
      aria-label="Pinned projects"
      data-empty={shown === 0 ? "true" : undefined}
      className="project-chips flex min-w-0 flex-[1_1_0] items-center gap-1 overflow-hidden pl-2"
    >
      {projects.map((project, index) => {
        const status = statuses[project.id]
        return (
          <Tooltip key={project.id} content={project.directory}>
            <button
              type="button"
              inert={index >= shown}
              style={index >= shown ? { visibility: "hidden" } : undefined}
              className="project-chip flex h-7 min-w-0 max-w-35 shrink-0 items-center gap-1.5 px-2.5 text-control"
              aria-description={status && statusText[status]}
              data-project-status={status}
              data-needs-person={needsPerson(status) ? "true" : undefined}
              onClick={() => onSelect(project.id)}
            >
              {status && <span aria-hidden="true" className="project-chip-status" />}
              <span className="min-w-0 truncate">{project.name}</span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
