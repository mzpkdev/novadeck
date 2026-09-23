import { verticalCompactor } from "react-grid-layout"

import type { GridBreakpoint, GridLayouts, Session } from "../model/types"

export const gridColumns = { wide: 16, desktop: 12, tablet: 8, mobile: 4 }
const expandedHeight = (session: Session): number => Math.ceil((session.height + 16) / 24)

export const visibleGridLayouts = (
  sessions: Session[],
  layouts: GridLayouts,
  minimized: Record<string, boolean>,
): GridLayouts => {
  const result: GridLayouts = {}
  for (const breakpoint of Object.keys(gridColumns) as GridBreakpoint[]) {
    const saved = layouts[breakpoint] ?? []
    const bottom = saved.reduce((end, item) => Math.max(end, item.y + item.h), 0)
    result[breakpoint] = verticalCompactor.compact(
      sessions.map((session, index) => {
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
        return minimized[session.id] ? { ...item, h: 3, minH: 3, maxH: 3, isResizable: true } : item
      }),
      gridColumns[breakpoint],
    )
  }
  return result
}

export const expandedGridLayouts = (
  next: GridLayouts,
  previous: GridLayouts,
  sessions: Session[],
  minimized: Record<string, boolean>,
): GridLayouts => {
  const result: GridLayouts = {}
  for (const breakpoint of Object.keys(next) as GridBreakpoint[]) {
    result[breakpoint] =
      next[breakpoint]?.map((item) => {
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
      }) ?? []
  }
  return result
}
