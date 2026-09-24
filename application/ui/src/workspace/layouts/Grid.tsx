import { useCallback, useLayoutEffect, useRef, useMemo, useState, type ReactNode } from "react"
import {
  getBreakpointFromWidth,
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout"

import type {
  SizePreset,
  Session,
  GridBreakpoint,
  GridLayouts,
  GridRestoreWidths,
} from "../model/types"
import type { MinimizeControls } from "../terminals/Terminal"
import { backgroundPointerHandlers } from "./background"
import {
  expandedGridLayouts,
  gridColumns,
  toggleGridWidth,
  type GridWidthToggle,
  visibleGridLayouts,
} from "./grid-layout"
import { useTerminalVisibility } from "./useTerminalVisibility"

const breakpoints = { wide: 1586, desktop: 1036, tablet: 636, mobile: 0 }

type Props = {
  presets: Record<string, SizePreset>
  restoreWidths: Record<string, GridRestoreWidths>
  onToggleWidth: (id: string, change: GridWidthToggle) => void
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
  render: (
    session: Session,
    minimize: MinimizeControls,
    resize: (button: HTMLButtonElement) => void,
  ) => ReactNode
}

export const Grid = ({
  presets,
  restoreWidths,
  onToggleWidth,
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
  const [resizeRequest, setResizeRequest] = useState<{ id: string; navigation: number } | null>(
    null,
  )
  const resized = resizeRequest?.navigation === navigation ? resizeRequest.id : null
  const removed = useTerminalVisibility(hidden)
  const lastNavigation = useRef({ navigation: 0, width: 0 })
  useLayoutEffect(() => {
    if (
      resized ||
      !mounted ||
      navigation === 0 ||
      (navigation === lastNavigation.current.navigation && width === lastNavigation.current.width)
    )
      return
    const container = containerRef.current
    if (!container) return
    let frame = 0
    const scroll = (): void => {
      frame = 0
      const terminal = container.querySelector<HTMLElement>(`[data-grid-terminal="${selected}"]`)
      if (!terminal) return
      terminal.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "nearest",
        inline: "nearest",
      })
      lastNavigation.current = { navigation, width }
      observer.disconnect()
    }
    // ResponsiveGridLayout may render the new card after this effect's first frame.
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(scroll)
    })
    observer.observe(container, { childList: true, subtree: true })
    frame = requestAnimationFrame(scroll)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [mounted, navigation, selected, width, containerRef, resized])
  const base = useMemo(
    () => visibleGridLayouts(sessions, layouts, minimized, removed),
    [sessions, layouts, minimized, removed],
  )
  const current = base

  useLayoutEffect(() => {
    if (!resized) return
    const breakpoint = getBreakpointFromWidth(breakpoints, width) as GridBreakpoint
    const item = current[breakpoint]?.find((entry) => entry.i === resized)
    const stage = containerRef.current?.closest<HTMLElement>(".grid-stage")
    if (!stage || !item) return
    const top = item.y * 24
    const frame = requestAnimationFrame(() => stage.scrollTo({ top, behavior: "instant" }))
    return () => cancelAnimationFrame(frame)
  }, [resized, current, width, containerRef])

  const resizeToViewport = useCallback(
    (id: string): void => {
      if (!width) return
      const expand = presets[id] !== "large"
      const change = toggleGridWidth(
        id,
        expand,
        sessions,
        layouts,
        minimized,
        removed,
        restoreWidths[id],
      )
      onToggleWidth(id, change)
      setResizeRequest({ id, navigation })
    },
    [
      width,
      minimized,
      sessions,
      layouts,
      removed,
      navigation,
      presets,
      restoreWidths,
      onToggleWidth,
    ],
  )

  return (
    <div
      className="grid-viewport relative flex min-h-0 flex-1 overflow-hidden workspace-background"
      tabIndex={-1}
      data-has-selection={Boolean(selected)}
      {...backgroundPointerHandlers}
      onPointerDownCapture={(event) => {
        setResizeRequest(null)
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
      <div
        className="grid-stage relative z-1 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable]"
        onTransitionEnd={(event) => {
          const terminal = event.target as HTMLElement
          if (!resized || terminal.dataset.gridTerminal !== resized) return
          const breakpoint = getBreakpointFromWidth(breakpoints, width) as GridBreakpoint
          const item = current[breakpoint]?.find((entry) => entry.i === resized)
          if (item) event.currentTarget.scrollTo({ top: item.y * 24, behavior: "instant" })
        }}
      >
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
                      {render(
                        session,
                        {
                          minimized: minimized[session.id] ?? false,
                          // Keep output painted while the grid's height transition clips it away.
                          clipContent: true,
                          onToggle: () => onMinimize(session.id),
                        },
                        () => resizeToViewport(session.id),
                      )}
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
