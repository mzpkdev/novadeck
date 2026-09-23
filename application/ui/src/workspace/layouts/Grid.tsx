import { useLayoutEffect, useRef, useMemo, useState, type ReactNode } from "react"
import {
  calcXY,
  getBreakpointFromWidth,
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout"
import { calcGridColWidth, calcGridItemWHPx } from "react-grid-layout/core"

import type { Session, GridBreakpoint, GridLayouts } from "../model/types"
import type { MinimizeControls } from "../terminals/Terminal"
import { backgroundPointerHandlers } from "./background"
import {
  expandedGridLayouts,
  gridColumns,
  previewGridPlacement,
  visibleGridLayouts,
} from "./grid-layout"
import { useTerminalVisibility } from "./useTerminalVisibility"

const breakpoints = { wide: 1586, desktop: 1036, tablet: 636, mobile: 0 }

type Props = {
  placement?: string | null
  onPlace?: () => void
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
  placement,
  onPlace,
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
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const [placing, setPlacing] = useState<{ id: string; layouts: GridLayouts } | null>(null)
  const activePreview = placing && placing.id === placement ? placing.layouts : null
  useLayoutEffect(() => {
    if (selected === placement) {
      lastNavigation.current = { navigation, width }
      return
    }
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
  }, [mounted, navigation, selected, placement, width, containerRef])
  const base = useMemo(
    () =>
      visibleGridLayouts(
        sessions.filter((session) => session.id !== placement),
        layouts,
        minimized,
        removed,
      ),
    [sessions, layouts, minimized, removed, placement],
  )
  const current = activePreview ?? base

  const previewAt = (clientX: number, clientY: number): GridLayouts | null => {
    if (!placement || !width || !mounted) return null
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return null
    const breakpoint = getBreakpointFromWidth(breakpoints, width) as GridBreakpoint
    const item = visibleGridLayouts(sessions, layouts, minimized, removed)[breakpoint]?.find(
      (entry) => entry.i === placement,
    )
    if (!item) return null
    const params = {
      margin: [16, 16] as const,
      containerPadding: [0, 0] as const,
      containerWidth: width,
      cols: gridColumns[breakpoint],
      rowHeight: 8,
      maxRows: Infinity,
    }
    const itemWidth = calcGridItemWHPx(item.w, calcGridColWidth(params), 16)
    const itemHeight = calcGridItemWHPx(item.h, 8, 16)
    const { x, y } = calcXY(
      params,
      clientY - bounds.top - itemHeight / 2,
      clientX - bounds.left - itemWidth / 2,
      item.w,
      item.h,
    )
    return previewGridPlacement(sessions, layouts, minimized, removed, placement, breakpoint, x, y)
  }

  return (
    <div
      className="grid-viewport relative flex min-h-0 flex-1 overflow-hidden workspace-background"
      tabIndex={-1}
      data-has-selection={Boolean(selected)}
      {...backgroundPointerHandlers}
      onPointerDownCapture={(event) => {
        if (placement) return
        const id = (event.target as Element).closest<HTMLElement>("[data-grid-terminal]")?.dataset
          .gridTerminal
        onSelect(id ?? "")
        if (!id) event.currentTarget.focus({ preventScroll: true })
      }}
      onFocusCapture={(event) => {
        if (placement) return
        const id = (event.target as Element).closest<HTMLElement>("[data-grid-terminal]")?.dataset
          .gridTerminal
        if (id) onSelect(id)
      }}
    >
      <div className="workspace-dots absolute inset-0 canvas-grid" aria-hidden="true" />
      <div className="workspace-dots absolute inset-0 canvas-grid-spotlight" aria-hidden="true" />
      <div
        className="grid-stage relative z-1 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable] [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-control [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar]:w-[var(--spacing)]"
        onPointerMove={(event) => {
          if (!placement || event.pointerType === "touch") {
            lastPointer.current = null
            return
          }
          lastPointer.current = { x: event.clientX, y: event.clientY }
          const next = previewAt(event.clientX, event.clientY)
          if (next) setPlacing({ id: placement, layouts: next })
        }}
        onPointerLeave={() => {
          lastPointer.current = null
          setPlacing(null)
        }}
        onScroll={() => {
          if (!placement || !lastPointer.current) return
          const next = previewAt(lastPointer.current.x, lastPointer.current.y)
          if (next) setPlacing({ id: placement, layouts: next })
        }}
        onPointerDownCapture={(event) => {
          if (!placement || event.button !== 0 || !event.isPrimary) return
          event.preventDefault()
          event.stopPropagation()
        }}
        onClickCapture={(event) => {
          if (!placement || event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          const next = previewAt(event.clientX, event.clientY)
          if (!next) return
          onLayoutsChange(expandedGridLayouts(next, layouts, sessions, minimized, removed))
          onPlace?.()
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
                if (placement) return
                const saved = expandedGridLayouts(next, layouts, sessions, minimized, removed)
                if (saved !== layouts) onLayoutsChange(saved)
              }}
            >
              {sessions
                .filter(
                  (session) =>
                    !removed[session.id] && (session.id !== placement || activePreview !== null),
                )
                .map((session) => (
                  <div
                    className={`grid-terminal flex min-h-0 flex-col ${selected === session.id ? "selected" : ""} ${minimized[session.id] ? "minimized" : ""} ${placement === session.id ? "pointer-events-none" : ""}`}
                    key={session.id}
                    data-grid-terminal={session.id}
                    data-grid-placement={placement === session.id}
                    data-preview={preview === session.id}
                    style={placement === session.id ? { opacity: 0.75 } : undefined}
                    inert={placement === session.id || (hidden[session.id] ?? false)}
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
