import { cloneLayout, moveElement, verticalCompactor } from "react-grid-layout"

import type { GridBreakpoint, GridLayouts, Session } from "../model/types"

export const gridColumns = { wide: 16, desktop: 12, tablet: 8, mobile: 4 }
const expandedHeight = (session: Session): number => Math.ceil((session.height + 16) / 24)

export const visibleGridLayouts = (
  sessions: Session[],
  layouts: GridLayouts,
  minimized: Record<string, boolean>,
  hidden: Record<string, boolean> = {},
): GridLayouts => {
  const result: GridLayouts = {}
  for (const breakpoint of Object.keys(gridColumns) as GridBreakpoint[]) {
    const saved = layouts[breakpoint] ?? []
    const bottom = saved.reduce((end, item) => Math.max(end, item.y + item.h), 0)
    result[breakpoint] = verticalCompactor.compact(
      sessions
        .map((session, index) => {
          const previous = saved.find((item) => item.i === session.id)
          const item = previous ?? {
            i: session.id,
            x: (index % (gridColumns[breakpoint] / 4)) * 4,
            y: bottom + Math.floor(index / (gridColumns[breakpoint] / 4)) * 100,
            w: 4,
            h: expandedHeight(session),
            minW: 4,
            minH: 10,
          }
          // Three rows form a 56px header with this grid's 8px rows and 16px gaps.
          return minimized[session.id]
            ? { ...item, h: 3, minH: 3, maxH: 3, isResizable: true }
            : item
        })
        .filter((item) => !hidden[item.i]),
      gridColumns[breakpoint],
    )
  }
  return result
}

export const previewGridPlacement = (
  sessions: Session[],
  layouts: GridLayouts,
  minimized: Record<string, boolean>,
  hidden: Record<string, boolean>,
  placement: string,
  breakpoint: GridBreakpoint,
  x: number,
  y: number,
): GridLayouts => {
  const full = visibleGridLayouts(sessions, layouts, minimized, hidden)
  const item = full[breakpoint]?.find((entry) => entry.i === placement)
  if (!item) return full

  // Begin below the existing cards, then move with the same collision rules as a drag.
  const existing = cloneLayout(
    visibleGridLayouts(
      sessions.filter((session) => session.id !== placement),
      layouts,
      minimized,
      hidden,
    )[breakpoint] ?? [],
  )
  const ghost = { ...item, y: existing.reduce((end, entry) => Math.max(end, entry.y + entry.h), 0) }
  const movable = [...existing, ghost]
  const moved = moveElement(
    movable,
    ghost,
    x,
    y,
    true,
    false,
    "vertical",
    gridColumns[breakpoint],
    false,
  )
  return { ...full, [breakpoint]: verticalCompactor.compact(moved, gridColumns[breakpoint]) }
}

const sameGeometry = (next: GridLayouts, projected: GridLayouts): boolean =>
  (Object.keys(next) as GridBreakpoint[]).every((breakpoint) => {
    const actual = next[breakpoint] ?? []
    const expected = projected[breakpoint] ?? []
    return (
      actual.length === expected.length &&
      actual.every((item) => {
        const match = expected.find((entry) => entry.i === item.i)
        return match?.x === item.x && match.y === item.y && match.w === item.w && match.h === item.h
      })
    )
  })

export const expandedGridLayouts = (
  next: GridLayouts,
  previous: GridLayouts,
  sessions: Session[],
  minimized: Record<string, boolean>,
  hidden: Record<string, boolean> = {},
): GridLayouts => {
  // Hiding or folding changes the projected layout without changing the saved arrangement.
  const projected = Object.values(hidden).some(Boolean)
    ? visibleGridLayouts(sessions, previous, minimized, hidden)
    : undefined
  if (projected && sameGeometry(next, projected)) return previous

  const result: GridLayouts = {}
  for (const breakpoint of new Set([
    ...(Object.keys(previous) as GridBreakpoint[]),
    ...(Object.keys(next) as GridBreakpoint[]),
  ])) {
    if (
      projected &&
      sameGeometry({ [breakpoint]: next[breakpoint] }, { [breakpoint]: projected[breakpoint] })
    ) {
      if (previous[breakpoint]) result[breakpoint] = previous[breakpoint]
      continue
    }
    const visible = next[breakpoint]?.map((item) => {
      if (!minimized[item.i]) return item
      const saved = previous[breakpoint]?.find((entry) => entry.i === item.i)
      const session = sessions.find((entry) => entry.id === item.i)
      // Retain drag/compaction coordinates without replacing the expanded height with the header.
      const restored = {
        ...item,
        h: saved?.h ?? (session ? expandedHeight(session) : 10),
        minH: 10,
        isResizable: true,
      }
      if (saved?.maxH === undefined) delete restored.maxH
      else restored.maxH = saved.maxH
      return restored
    })
    result[breakpoint] = visible
      ? [...visible, ...(previous[breakpoint]?.filter((item) => hidden[item.i]) ?? [])]
      : (previous[breakpoint] ?? [])
  }
  return result
}
