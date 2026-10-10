import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { pinnedProjectShortcut } from "../interaction/shortcuts"
import { Tooltip } from "../ui-toolkit/Tooltip"
import { pinsThatFit } from "./pins-fit"
import { needsPerson, statusText, type ProjectStatus } from "./project-status"

type Pin = { readonly id: string; readonly name: string; readonly directory: string }

// The pinned projects, as a bar under the header, in the person's order: each pin is its
// number (its Ctrl or ⌘ shortcut), its name and a mark of what its project's terminals ask
// of the person, and a click switches to it. The bar slides in with the first pin and out
// with the last. The current pin stays in its place, marked as current, so switching never
// moves the others, and a mark's slot is always there, so one appearing never does either.
// They take the room the bar leaves them: each shows whole or not at all, the last ones
// first to go, and `onShown` says which show. All stay in the bar so each can be measured;
// the ones that don't fit are hidden and inert.
export const PinsBar = ({
  pins,
  current,
  statuses,
  hidden = false,
  onSelect,
  onShown,
}: {
  pins: readonly Pin[]
  // The project the workspace shows.
  current: string
  // What each project's terminals show, by its id, where they show anything.
  statuses: Readonly<Record<string, ProjectStatus>>
  // Hidden with the header, in Zen.
  hidden?: boolean
  onSelect: (id: string) => void
  onShown: (ids: readonly string[]) => void
}): React.JSX.Element => {
  // The last pins stay while the bar slides out.
  const [items, setItems] = useState(pins)
  if (pins.length > 0 && pins !== items) setItems(pins)
  const open = pins.length > 0 && !hidden

  // A page that loads with pins shows the bar as it is; only later changes slide.
  const [animated, setAnimated] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const row = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(items.length)
  const shown = pins.length === 0 ? 0 : Math.min(count, pins.length)

  // Measures before paint, and again as the bar or a pin changes size.
  useLayoutEffect(() => {
    const element = row.current
    if (!element || items.length === 0) return
    const measure = (): void => {
      const style = getComputedStyle(element)
      const available =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const widths = [...element.querySelectorAll<HTMLElement>(".pin")].map(
        (pin) => pin.offsetWidth,
      )
      setCount(pinsThatFit(available, widths, parseFloat(style.columnGap) || 0))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const pin of element.querySelectorAll(".pin")) observer.observe(pin)
    return () => observer.disconnect()
  }, [items])

  // Tells which show, once at first and then only when they change.
  const told = useRef<readonly string[] | null>(null)
  useLayoutEffect(() => {
    const ids = pins.slice(0, shown).map(({ id }) => id)
    const before = told.current
    if (before && before.length === ids.length && before.every((id, i) => id === ids[i])) return
    told.current = ids
    onShown(ids)
  }, [pins, shown, onShown])

  return (
    <div
      className="pins-bar"
      data-open={open ? "true" : undefined}
      data-animated={animated ? "true" : undefined}
      inert={!open}
    >
      <div className="pins-bar-clip">
        <div
          ref={row}
          role="group"
          aria-label="Pinned projects"
          className="pins-bar-row flex items-stretch gap-0.5 px-2.5"
        >
          {items.map((project, index) => {
            // A project only working shows nothing: the bar stays still while agents work.
            const status = needsPerson(statuses[project.id]) ? statuses[project.id] : undefined
            const isCurrent = project.id === current
            const shortcut = pinnedProjectShortcut(index)
            return (
              <Tooltip
                key={project.id}
                content={`${project.directory} · ${shortcut.display.join(" ")}`}
              >
                <button
                  type="button"
                  inert={index >= shown}
                  style={index >= shown ? { visibility: "hidden" } : undefined}
                  className="pin flex min-w-0 max-w-50 shrink-0 items-center px-2.5"
                  aria-current={isCurrent ? "true" : undefined}
                  aria-keyshortcuts={`${shortcut.meta ? "Meta" : "Control"}+${shortcut.key}`}
                  aria-description={status && statusText[status]}
                  data-project-status={status}
                  onClick={() => {
                    if (!isCurrent) onSelect(project.id)
                  }}
                >
                  <span aria-hidden="true" className="pin-number text-control">
                    {index + 1}
                  </span>
                  <span className="pin-name min-w-0 truncate text-body">{project.name}</span>
                  <span aria-hidden="true" className="project-status-mark pin-mark" />
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>
    </div>
  )
}
