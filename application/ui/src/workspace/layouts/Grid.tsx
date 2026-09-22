import { useLayoutEffect, useRef, useMemo, type ReactNode } from "react"
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout"

import type { Session, GridLayouts, GridBreakpoint } from "../model/types"
import { backgroundPointerHandlers } from "./background"

const breakpoints = { wide: 1586, desktop: 1036, tablet: 636, mobile: 0 }
const columns = { wide: 16, desktop: 12, tablet: 8, mobile: 4 }
type Breakpoint = GridBreakpoint

type Props = {
  sessions: Session[]
  navigation: number
  selected: string
  onSelect: (id: string) => void
  layouts: GridLayouts
  onLayoutsChange: (layouts: GridLayouts) => void
  render: (session: Session) => ReactNode
}

export const Grid = ({
  sessions,
  selected,
  navigation,
  onSelect,
  layouts,
  onLayoutsChange,
  render,
}: Props): React.JSX.Element => {
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })
  const lastNavigation = useRef({ navigation: 0, width: 0 })
  useLayoutEffect(() => {
    if (
      !mounted ||
      navigation === 0 ||
      (navigation === lastNavigation.current.navigation && width === lastNavigation.current.width)
    )
      return
    const terminal = containerRef.current?.querySelector<HTMLElement>(
      `[data-grid-terminal="${selected}"]`,
    )
    if (!terminal) return
    terminal.scrollIntoView({ block: "nearest", inline: "nearest" })
    lastNavigation.current = { navigation, width }
  }, [mounted, navigation, selected, width, containerRef])
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
    <div
      className="grid-viewport relative flex min-h-0 flex-1 overflow-hidden workspace-background"
      tabIndex={-1}
      {...backgroundPointerHandlers}
      onPointerDownCapture={(event) => {
        const id = (event.target as Element).closest<HTMLElement>("[data-grid-terminal]")?.dataset
          .gridTerminal
        onSelect(id ?? "")
        if (!id) event.currentTarget.focus({ preventScroll: true })
      }}
      onFocusCapture={(event) => {
        const id = (event.target as Element).closest<HTMLElement>("[data-grid-terminal]")?.dataset
          .gridTerminal
        if (id) onSelect(id)
      }}
    >
      <div className="workspace-dots absolute inset-0 canvas-grid" aria-hidden="true" />
      <div className="workspace-dots absolute inset-0 canvas-grid-spotlight" aria-hidden="true" />
      <div className="grid-stage relative z-1 min-h-0 flex-1 overflow-auto p-4 [scrollbar-gutter:stable]">
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
                <div
                  className={`grid-terminal flex min-h-0 flex-col ${selected === session.id ? "selected" : ""}`}
                  key={session.id}
                  data-grid-terminal={session.id}
                >
                  <div className="grid-terminal-body min-h-0 flex-1">{render(session)}</div>
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>
      </div>
    </div>
  )
}
