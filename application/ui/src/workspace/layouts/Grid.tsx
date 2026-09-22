import { useLayoutEffect, useRef, useMemo, type ReactNode } from "react"
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout"

import type { Session, GridLayouts } from "../model/types"
import type { MinimizeControls } from "../terminals/Terminal"
import { backgroundPointerHandlers } from "./background"
import { expandedGridLayouts, gridColumns, visibleGridLayouts } from "./grid-layout"

const breakpoints = { wide: 1586, desktop: 1036, tablet: 636, mobile: 0 }

type Props = {
  sessions: Session[]
  navigation: number
  selected: string
  onSelect: (id: string) => void
  layouts: GridLayouts
  onLayoutsChange: (layouts: GridLayouts) => void
  minimized: Record<string, boolean>
  onMinimize: (id: string) => void
  render: (session: Session, minimize: MinimizeControls) => ReactNode
}

export const Grid = ({
  sessions,
  selected,
  navigation,
  onSelect,
  layouts,
  onLayoutsChange,
  minimized,
  onMinimize,
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
  const current = useMemo(
    () => visibleGridLayouts(sessions, layouts, minimized),
    [sessions, layouts, minimized],
  )

  return (
    <div
      className="grid-viewport relative flex min-h-0 flex-1 overflow-hidden workspace-background"
      tabIndex={-1}
      data-has-selection={Boolean(selected)}
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
              cols={gridColumns}
              layouts={current}
              rowHeight={8}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              compactor={verticalCompactor}
              dragConfig={{ handle: ".terminal-header", cancel: "button, input", threshold: 5 }}
              resizeConfig={{ handles: ["se"] }}
              onLayoutChange={(_, next) =>
                onLayoutsChange(expandedGridLayouts(next, layouts, sessions, minimized))
              }
            >
              {sessions.map((session) => (
                <div
                  className={`grid-terminal flex min-h-0 flex-col ${selected === session.id ? "selected" : ""} ${minimized[session.id] ? "minimized" : ""}`}
                  key={session.id}
                  data-grid-terminal={session.id}
                >
                  <div className="grid-terminal-body min-h-0 flex-1">
                    {render(session, {
                      minimized: minimized[session.id] ?? false,
                      // Keep output painted while the grid's height transition clips it away.
                      clipContent: true,
                      onToggle: () => onMinimize(session.id),
                    })}
                  </div>
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>
      </div>
    </div>
  )
}
