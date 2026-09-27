import { Suspense, useCallback, useMemo, type RefObject } from "react"

import type { CanvasHandle } from "../layouts/canvas/types"
import { Focus } from "../layouts/focus/Focus"
import type { ValueUpdate } from "../model/state"
import type { CanvasLayout, GridLayouts } from "../model/types"
import { EmptyWorkspace } from "../shell/EmptyWorkspace"
import { useWorkspace } from "./controller/context"
import { Canvas, Grid } from "./deferred-views"
import { renderTerminal } from "./WorkspaceTerminal"

const useLayoutHidden = (hidden: Record<string, boolean>, preview: string) =>
  useMemo(() => (preview ? { ...hidden, [preview]: false } : hidden), [hidden, preview])

// The current session's view, remounted per session so each keeps its own view state.
export const WorkspaceStage = ({
  canvas,
}: {
  readonly canvas: RefObject<CanvasHandle | null>
}): React.JSX.Element => {
  const { session: current, target, context, shell, commands, active } = useWorkspace()
  const { view, selected } = current.state
  const { terminals } = current.state.roster
  const {
    canvas: canvasLayout,
    grid: gridLayouts,
    gridRestoreWidths,
    gridMinimized,
    sizePresets,
    hidden,
  } = current.state.layout
  const {
    zen,
    showSessions,
    revealCanvas,
    canvasKeyboardFocus,
    navigation: shellNavigation,
  } = shell
  const {
    setSelected,
    add,
    setCanvasLayout: saveCanvasLayout,
    setGridLayouts: saveGridLayouts,
    toggleGridWidth,
    toggleGridMinimized,
    setSizePreset,
    showAll,
  } = commands
  const preview = hidden[selected] ? selected : ""
  const layoutHidden = useLayoutHidden(hidden, preview)
  // Views save layouts for the session they rendered, even after it is left.
  const setCanvasLayout = useCallback(
    (layout: ValueUpdate<CanvasLayout>) => saveCanvasLayout(target, layout),
    [saveCanvasLayout, target],
  )
  const setGridLayouts = useCallback(
    (layouts: ValueUpdate<GridLayouts>) => saveGridLayouts(target, layouts),
    [saveGridLayouts, target],
  )
  return (
    <section
      key={context}
      data-workspace-area
      className={`main-area relative flex min-w-0 flex-1 flex-col ${view}`}
      aria-label={`${view} view`}
    >
      <Suspense
        key={view}
        fallback={
          <div
            role="status"
            aria-label="Loading workspace"
            className="flex flex-1 items-center justify-center text-sm text-muted"
          >
            Loading workspace…
          </div>
        }
      >
        {view === "focus" && active && (
          <Focus
            terminals={terminals}
            displayed={active.id}
            onSelect={setSelected}
            render={renderTerminal}
          />
        )}
        {view === "grid" && (
          <Grid
            terminals={terminals}
            hidden={layoutHidden}
            preview={preview}
            selected={selected}
            onSelect={setSelected}
            navigation={shellNavigation.count}
            presets={sizePresets.grid}
            restoreWidths={gridRestoreWidths}
            onToggleWidth={(terminalId, change) => toggleGridWidth(target, terminalId, change)}
            layouts={gridLayouts}
            onLayoutsChange={setGridLayouts}
            minimized={gridMinimized}
            onMinimize={(terminalId) => toggleGridMinimized(target, terminalId)}
            onCreate={() => {
              add({ beginRename: false })
            }}
            render={renderTerminal}
          />
        )}
        {view === "canvas" && (
          <Canvas
            ref={canvas}
            hidden={layoutHidden}
            preview={preview}
            presets={sizePresets.canvas}
            onPresetChange={(terminalId, preset) =>
              setSizePreset(target, terminalId, "canvas", preset)
            }
            layout={canvasLayout}
            matchCreatedTerminalRatio={Boolean(zen)}
            revealOnMount={revealCanvas}
            fitOnNavigate={shellNavigation.fit}
            onLayoutChange={setCanvasLayout}
            terminals={terminals}
            selected={selected}
            keyboardFocusRequest={
              canvasKeyboardFocus?.context === context && canvasKeyboardFocus.id === selected
                ? canvasKeyboardFocus.request
                : null
            }
            navigation={shellNavigation.count}
            onSelect={setSelected}
            onCreate={() => add({ beginRename: false })}
            render={renderTerminal}
          />
        )}
      </Suspense>
      {view !== "focus" &&
        terminals.length > 0 &&
        terminals.every((terminal) => layoutHidden[terminal.id]) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted">All terminals are hidden</p>
            <button
              className="small-button"
              onClick={() =>
                showAll(
                  target,
                  terminals.map((terminal) => terminal.id),
                )
              }
            >
              Show all terminals
            </button>
          </div>
        )}
      {!terminals.length && (
        <EmptyWorkspace
          view={view}
          zen={Boolean(zen)}
          onCreate={() => add()}
          onShowSessions={showSessions}
        />
      )}
    </section>
  )
}
