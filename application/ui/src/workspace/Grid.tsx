import { useMemo, type ReactNode } from "react"
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type ResponsiveLayouts,
} from "react-grid-layout"

import { backgroundPointerHandlers } from "./background"
import type { Session } from "./sessions"

const breakpoints = { wide: 1586, desktop: 1036, tablet: 636, mobile: 0 }
const columns = { wide: 16, desktop: 12, tablet: 8, mobile: 4 }
type Breakpoint = keyof typeof columns
export type GridLayouts = ResponsiveLayouts<Breakpoint>

type Props = {
  sessions: Session[]
  layouts: GridLayouts
  onLayoutsChange: (layouts: GridLayouts) => void
  render: (session: Session) => ReactNode
}

export const Grid = ({ sessions, layouts, onLayoutsChange, render }: Props): React.JSX.Element => {
  const { width, containerRef, mounted } = useContainerWidth()
  const current = useMemo(() => {
    const result: GridLayouts = {}
    for (const breakpoint of Object.keys(columns) as Breakpoint[]) {
      const saved = layouts[breakpoint] ?? []
      const bottom = saved.reduce((end, item) => Math.max(end, item.y + item.h), 0)
      // Reconcile by session ID so renaming, closing, and adding keep existing geometry.
      result[breakpoint] = verticalCompactor.compact(
        sessions.map((session, index) => {
          const previous = saved.find((item) => item.i === session.id)
          return (
            previous ?? {
              i: session.id,
              x: (index % (columns[breakpoint] / 4)) * 4,
              y: bottom + Math.floor(index / (columns[breakpoint] / 4)) * 100,
              w: 4,
              h: Math.ceil((session.height + 16) / 24),
              minW: 4,
              minH: 10,
            }
          )
        }),
        columns[breakpoint],
      )
    }
    return result
  }, [sessions, layouts])

  return (
    <div className="grid-viewport workspace-background" {...backgroundPointerHandlers}>
      <div className="grid-dots canvas-grid" aria-hidden="true" />
      <div className="grid-dots canvas-grid-spotlight" aria-hidden="true" />
      <div className="grid-stage">
        <div ref={containerRef}>
          {mounted && (
            <ResponsiveGridLayout
              className="terminal-grid"
              width={width}
              breakpoints={breakpoints}
              cols={columns}
              layouts={current}
              rowHeight={8}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              compactor={verticalCompactor}
              dragConfig={{ handle: ".terminal-header", cancel: "button, input", threshold: 5 }}
              resizeConfig={{ handles: ["se"] }}
              onLayoutChange={(_, next) => onLayoutsChange(next)}
            >
              {sessions.map((session) => (
                <div className="grid-terminal" key={session.id} data-grid-terminal={session.id}>
                  <div className="grid-terminal-body">{render(session)}</div>
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>
      </div>
    </div>
  )
}
