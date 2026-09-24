import { verticalCompactor } from "react-grid-layout"

import type { GridBreakpoint, GridLayouts, Session } from "../model/types"
import { canvasPresetSize, gridPresetWidth } from "./terminal-size"

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

export const addCompactGridTerminal = (
  sessions: Session[],
  layouts: GridLayouts,
  terminal: Session,
): GridLayouts => {
  const current = visibleGridLayouts(sessions, layouts, {})
  const next: GridLayouts = {}
  for (const breakpoint of Object.keys(gridColumns) as GridBreakpoint[]) {
    const existing = layouts[breakpoint] ?? current[breakpoint] ?? []
    const width = gridPresetWidth(gridColumns[breakpoint], "small")
    const height = Math.ceil((canvasPresetSize("small").height + 16) / 24)
    const rows = [0, ...existing.map((item) => item.y + item.h)]
    let position = { x: 0, y: Math.max(...rows) }
    for (const y of rows) {
      const x = Array.from(
        { length: gridColumns[breakpoint] - width + 1 },
        (_, index) => index,
      ).find((candidate) =>
        existing.every(
          (item) =>
            candidate + width <= item.x ||
            candidate >= item.x + item.w ||
            y + height <= item.y ||
            y >= item.y + item.h,
        ),
      )
      if (x === undefined || y >= position.y) continue
      position = { x, y }
    }
    next[breakpoint] = [
      ...existing,
      {
        i: terminal.id,
        ...position,
        w: width,
        h: height,
        minW: 4,
        minH: 10,
      },
    ]
  }
  return next
}
