import { useLayoutEffect, useRef, useMemo, type ReactNode } from "react"
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout"

import type { Session, GridLayouts } from "../model/types"
import type { MinimizeControls } from "../terminals/Terminal"
import { backgroundPointerHandlers } from "./background"
import { expandedGridLayouts, gridColumns, visibleGridLayouts } from "./grid-layout"
import { useTerminalVisibility } from "./useTerminalVisibility"

const breakpoints = { wide: 1586, desktop: 1036, tablet: 636, mobile: 0 }

type Props = {
  sessions: Session[]
  navigation: number
  selected: string
  onSelect: (id: string) => void
  layouts: GridLayouts
  onLayoutsChange: (layouts: GridLayouts) => void
  minimized: Record<string, boolean>
  hidden: Record<string, boolean>
  preview: string
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
  hidden,
  preview,
  onMinimize,
  render,
}: Props): React.JSX.Element => {
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })
  const removed = useTerminalVisibility(hidden)
  const lastNavigation = useRef({ navigation: 0, width: 0 })
  useLayoutEffect(() => {
    if (
      !mounted ||
      navigation === 0 ||
      (navigation === lastNavigation.current.navigation && width === lastNavigation.current.width)
    )
      return
    // The grid reconciles restored children after this render; scroll once they are placed.
    const frame = requestAnimationFrame(() => {
      const terminal = containerRef.current?.querySelector<HTMLElement>(
        `[data-grid-terminal="${selected}"]`,
      )
      if (!terminal) return
      terminal.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "nearest",
        inline: "nearest",
      })
      lastNavigation.current = { navigation, width }
    })
    return () => cancelAnimationFrame(frame)
  }, [mounted, navigation, selected, width, containerRef])
  const current = useMemo(
    () => visibleGridLayouts(sessions, layouts, minimized, removed),
    [sessions, layouts, minimized, removed],
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
              onLayoutChange={(_, next) => {
                const saved = expandedGridLayouts(next, layouts, sessions, minimized, removed)
                if (saved !== layouts) onLayoutsChange(saved)
              }}
            >
              {sessions
                .filter((session) => !removed[session.id])
                .map((session) => (
                  <div
                    className={`grid-terminal flex min-h-0 flex-col ${selected === session.id ? "selected" : ""} ${minimized[session.id] ? "minimized" : ""}`}
                    key={session.id}
                    data-grid-terminal={session.id}
                    data-preview={preview === session.id}
                    inert={hidden[session.id] ?? false}
                    aria-hidden={hidden[session.id] ?? false}
                  >
                    <div
                      className="grid-terminal-body terminal-visibility min-h-0 flex-1"
                      data-hiding={hidden[session.id] ?? false}
                    >
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
