import "./canvas.css"
import {
  Background,
  getViewportForBounds,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type XYPosition,
} from "@xyflow/react"
import { Plus } from "lucide-react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

import { ContextMenu } from "../../../ui-toolkit/ContextMenu"
import type { TerminalMetadata, CanvasLayout } from "../../model/types"
import { workspaceOverlayOpen, workspaceShortcutTarget } from "../../shortcuts"
import { backgroundPointerHandlers } from "../background"
import { canvasNewTerminalSize, canvasPresetSize } from "../terminal-size"
import { useTerminalVisibility } from "../useTerminalVisibility"
import { fitOptions, canvasStep, terminalHeaderHeight, chromeScaleAt, centerOf } from "./geometry"
import { canvasPointPosition, viewportCanvasPosition } from "./placement"
import { TerminalContent, nodeTypes } from "./TerminalNode"
import type { CanvasProps, CanvasHandle, TerminalCanvasProps, TerminalNode } from "./types"
import { useCanvasGeometry } from "./useCanvasGeometry"
import { useCanvasNavigation } from "./useCanvasNavigation"
import { useCanvasPersistence } from "./useCanvasPersistence"
import { useCanvasVisit } from "./useCanvasVisit"
export type { CanvasHandle } from "./types"

const TerminalCanvas = ({
  presets,
  onPresetChange,
  layout,
  matchCreatedTerminalRatio,
  revealOnMount,
  fitOnNavigate,
  onLayoutChange,
  sessions,
  hidden,
  preview,
  selected,
  keyboardFocusRequest,
  navigation,
  onSelect,
  onCreate,
  render,
  handleRef,
}: TerminalCanvasProps): React.JSX.Element => {
  const { minimized, geometry } = layout
  const removed = useTerminalVisibility(hidden)
  const { fitView, zoomIn, zoomOut, getViewport, getNode, setNodes, screenToFlowPosition } =
    useReactFlow<TerminalNode>()
  const zoom = useStore((state) => state.transform[2])
  const viewportWidth = useStore((state) => state.width)
  const viewportHeight = useStore((state) => state.height)
  const maxZoom = Math.max(
    1.5,
    layout.viewport?.zoom ?? 1,
    Math.min(viewportWidth / 320, viewportHeight / 200),
  )
  const chromeScale = chromeScaleAt(zoom)
  const container = useRef<HTMLDivElement>(null)
  const [initialViewport] = useState(layout.viewport)
  const { visit, animateVisit } = useCanvasVisit(handleRef)
  const persistence = useCanvasPersistence({ layout, sessions, onLayoutChange })
  const {
    geometryRef,
    dirtyGeometry,
    resizing,
    viewportRef,
    mounted,
    commitGeometry,
    trackViewport,
    commitViewport,
  } = persistence
  const knownSessions = useRef(new Set(sessions.map((session) => session.id)))
  const createdPositions = useRef(new Map<string, XYPosition>())
  const pointerCreated = useRef(new Set<string>())
  const pendingCreatedPositions = useRef(new Map<string, XYPosition>())
  const contextPosition = useRef<XYPosition | null>(null)
  const stacking = useRef<string[]>([])
  const initializeViewport = useCanvasNavigation({
    navigation,
    selected,
    hidden,
    fitOnNavigate,
    revealOnMount,
    initialViewport,
    viewportWidth,
    viewportHeight,
    container,
    geometryRef,
    createdPositions,
    pointerCreated,
    visit,
  })
  const fitAll = useCallback((): void => {
    visit.clear()
    void fitView({
      ...fitOptions,
      nodes: sessions
        .filter((session) => !hidden[session.id])
        .map((session) => ({ id: session.id })),
    })
  }, [fitView, sessions, hidden, visit])
  const { beginResize, finishResize, onNodesChange } = useCanvasGeometry(persistence, onSelect)

  const resizeToViewport = useCallback(
    (id: string) => {
      const node = getNode(id)
      if (!node || !viewportWidth || !viewportHeight) return
      const preset = presets[id] === "large" ? "small" : "large"
      const { width, height } = canvasPresetSize(preset, {
        width: viewportWidth,
        height: viewportHeight,
      })
      const center = centerOf(node, getViewport().zoom)
      const next = {
        position: { x: center.x - width / 2, y: center.y - height / 2 },
        width,
        height,
      }
      onLayoutChange((previous) => ({
        ...previous,
        geometry: { ...previous.geometry, [id]: next },
        minimized: { ...previous.minimized, [id]: false },
      }))
      onPresetChange(id, preset)
    },
    [getNode, getViewport, onLayoutChange, viewportWidth, viewportHeight, presets, onPresetChange],
  )

  const flyTo = useCallback(
    (session: TerminalMetadata) => {
      if (visit.flying) return
      const node = getNode(session.id)
      if (!node) return
      onSelect(session.id)
      if (node.data.minimized) {
        onLayoutChange((previous) => ({
          ...previous,
          minimized: { ...previous.minimized, [session.id]: false },
        }))
      }
      if (!viewportWidth || !viewportHeight) return
      const viewport = getViewportForBounds(
        {
          ...node.position,
          width: node.width ?? 550,
          height: node.data.minimized
            ? (geometry[session.id]?.height ?? 400)
            : (node.height ?? 400),
        },
        viewportWidth,
        viewportHeight,
        0,
        Infinity,
        0,
      )
      const flight = visit.begin(session.id, getViewport(), viewport)
      if (!flight) return
      animateVisit(flight)
    },
    [
      animateVisit,
      geometry,
      getNode,
      getViewport,
      onLayoutChange,
      onSelect,
      viewportHeight,
      viewportWidth,
      visit,
    ],
  )

  const nodeFrom = useCallback(
    (
      session: TerminalMetadata,
      source: CanvasLayout["geometry"][string] | undefined,
    ): TerminalNode => {
      const isMinimized = minimized[session.id] ?? false
      const width = source?.width ?? 550
      return {
        id: session.id,
        type: "terminal",
        hidden: removed[session.id] ?? false,
        position: source?.position ?? { x: 80, y: 80 },
        width,
        height: isMinimized
          ? terminalHeaderHeight * chromeScale + 2
          : Math.max(source?.height ?? 400, (terminalHeaderHeight + 4) * chromeScale),
        dragHandle: ".terminal-header",
        draggable: selected === session.id && !hidden[session.id],
        selectable: !hidden[session.id],
        focusable: !hidden[session.id],
        selected: selected === session.id,
        ariaLabel: `${session.name} terminal`,
        data: {
          preview: preview === session.id,
          focusRequest: selected === session.id ? keyboardFocusRequest : null,
          hiding: hidden[session.id] ?? false,
          compactHeader: width / chromeScale < 240,
          minimized: isMinimized,
          onResizeStart: () => beginResize(session.id),
          onResizeEnd: (nextWidth, nextHeight) => finishResize(session.id, nextWidth, nextHeight),
        },
      }
    },
    [
      beginResize,
      chromeScale,
      finishResize,
      hidden,
      preview,
      removed,
      minimized,
      selected,
      keyboardFocusRequest,
    ],
  )

  const contentOf = useCallback(
    (id: string): ReactNode => {
      const session = sessions.find((item) => item.id === id)
      if (!session) return null
      return render(
        session,
        {
          minimized: minimized[id] ?? false,
          onToggle: () =>
            onLayoutChange((previous) => ({
              ...previous,
              minimized: { ...previous.minimized, [id]: !previous.minimized[id] },
            })),
        },
        () => flyTo(session),
        () => resizeToViewport(id),
      )
    },
    [flyTo, minimized, onLayoutChange, render, resizeToViewport, sessions],
  )

  // XYFlow owns pointer-time geometry so dragging does not rerender the application or terminals.
  // Parent updates refresh terminal content and selection while retaining any in-progress gesture.
  useEffect(() => {
    const sessionIds = new Set(sessions.map((session) => session.id))
    for (const id of Object.keys(geometryRef.current)) {
      if (!sessionIds.has(id)) {
        delete geometryRef.current[id]
        dirtyGeometry.current.delete(id)
        resizing.current.delete(id)
      }
    }
    for (const session of sessions) {
      if (!dirtyGeometry.current.has(session.id))
        geometryRef.current[session.id] = geometry[session.id] ?? {
          position: { x: 80, y: 80 },
        }
    }
    const created = sessions.filter((session) => !knownSessions.current.has(session.id))
    if (created.length && viewportWidth && viewportHeight) {
      const viewport = getViewport()
      const occupied = sessions
        .filter((session) => knownSessions.current.has(session.id))
        .map((session) => {
          const saved = geometryRef.current[session.id]
          const live = getNode(session.id)
          return {
            position: live?.position ?? saved?.position ?? { x: 80, y: 80 },
            width: live?.width ?? saved?.width ?? 550,
            height: saved?.height ?? 400,
          }
        })
      for (const session of created) {
        const saved = geometryRef.current[session.id]
        const size = canvasNewTerminalSize(
          { width: viewportWidth, height: viewportHeight },
          matchCreatedTerminalRatio,
          { width: saved?.width ?? 600, height: saved?.height ?? 400 },
        )
        const requested = pendingCreatedPositions.current.get(session.id)
        const position = requested
          ? canvasPointPosition(requested)
          : viewportCanvasPosition(
              occupied,
              viewport,
              { width: viewportWidth, height: viewportHeight },
              size,
            )
        geometryRef.current[session.id] = { ...saved, position, ...size }
        dirtyGeometry.current.add(session.id)
        if (requested) {
          pendingCreatedPositions.current.delete(session.id)
          pointerCreated.current.add(session.id)
        } else createdPositions.current.set(session.id, position)
        knownSessions.current.add(session.id)
        occupied.push({ position, ...size })
      }
      commitGeometry(created.map((session) => session.id))
    }
    for (const id of knownSessions.current) {
      if (!sessionIds.has(id)) {
        knownSessions.current.delete(id)
        createdPositions.current.delete(id)
      }
    }
    // Keep activation history instead of temporarily elevating only the selected node.
    const order = stacking.current.filter((id) => sessionIds.has(id))
    const known = new Set(order)
    const stack = [
      ...order,
      ...sessions.filter((session) => !known.has(session.id)).map((session) => session.id),
    ].filter((id) => id !== selected)
    if (sessionIds.has(selected)) stack.push(selected)
    stacking.current = stack
    const levels = new Map(stack.map((id, index) => [id, index]))
    setNodes((previous) => {
      const existing = new Map(previous.map((node) => [node.id, node]))
      return sessions.map((session) => {
        const next = {
          ...nodeFrom(session, geometryRef.current[session.id]),
          zIndex: levels.get(session.id) ?? 0,
        }
        const current = existing.get(session.id)
        if (!current || !dirtyGeometry.current.has(session.id)) return next
        const retained = {
          ...next,
          position: current.position,
          width: current.width ?? next.width ?? 550,
          height: current.height ?? next.height ?? 400,
        }
        return current.className ? { ...retained, className: current.className } : retained
      })
    })
  }, [
    commitGeometry,
    geometryRef,
    dirtyGeometry,
    resizing,
    geometry,
    getNode,
    getViewport,
    matchCreatedTerminalRatio,
    nodeFrom,
    selected,
    sessions,
    setNodes,
    viewportHeight,
    viewportWidth,
  ])

  const canvas = (
    <div
      data-workspace-viewport
      className="canvas-viewport relative min-h-0 flex-1 overflow-hidden bg-canvas touch-none workspace-background"
      ref={container}
      style={
        {
          "--canvas-chrome-scale": chromeScale,
          "--canvas-header-height": `${terminalHeaderHeight}px`,
        } as CSSProperties
      }
      aria-label="Terminal canvas"
      tabIndex={0}
      {...backgroundPointerHandlers}
      onContextMenu={(event) => {
        contextPosition.current = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      }}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229 ||
          event.repeat ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !workspaceShortcutTarget(event.target) ||
          workspaceOverlayOpen()
        )
          return
        if (event.key === "+" || (event.key === "=" && !event.shiftKey)) {
          event.preventDefault()
          visit.clear()
          void zoomIn()
        }
        if (event.key === "-" && !event.shiftKey) {
          event.preventDefault()
          visit.clear()
          void zoomOut()
        }
        if (event.key === "0" && !event.shiftKey) {
          event.preventDefault()
          fitAll()
        }
      }}
    >
      <TerminalContent.Provider value={contentOf}>
        <ReactFlow<TerminalNode>
          defaultNodes={sessions.map((session) => nodeFrom(session, geometry[session.id]))}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => onSelect(node.id)}
          onPaneClick={(event) => {
            onSelect("")
            event.currentTarget
              .closest<HTMLElement>(".canvas-viewport")
              ?.focus({ preventScroll: true })
          }}
          elevateNodesOnSelect={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          selectionKeyCode={null}
          disableKeyboardA11y
          minZoom={0.15}
          maxZoom={maxZoom}
          defaultViewport={initialViewport ?? { x: 0, y: 0, zoom: 1 }}
          onInit={initializeViewport}
          onMoveStart={(_, viewport) => trackViewport(viewport)}
          onMove={(event, viewport) => {
            const previous = viewportRef.current
            if (
              event &&
              (viewport.x !== previous.x ||
                viewport.y !== previous.y ||
                viewport.zoom !== previous.zoom)
            )
              visit.clear()
            trackViewport(viewport)
          }}
          onMoveEnd={(_, viewport) => {
            const current = getViewport()
            if (
              !mounted.current ||
              current.x !== viewport.x ||
              current.y !== viewport.y ||
              current.zoom !== viewport.zoom
            )
              return
            trackViewport(viewport)
            commitViewport()
          }}
          panOnDrag
          panOnScroll={false}
          zoomOnScroll
          zoomOnDoubleClick={false}
          zoomActivationKeyCode={["Control", "Meta"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            id="grid"
            className="canvas-grid"
            gap={canvasStep}
            size={1.6}
            color="var(--color-muted)"
            bgColor="transparent"
          />
          <Background
            id="grid-spotlight"
            className="canvas-grid-spotlight"
            gap={canvasStep}
            size={1.6}
            color="var(--color-muted)"
            bgColor="transparent"
          />
        </ReactFlow>
      </TerminalContent.Provider>
    </div>
  )
  return (
    <ContextMenu
      label="Canvas actions"
      items={[
        {
          value: "terminal",
          label: "Terminal",
          icon: <Plus size={13} aria-hidden="true" />,
          onSelect: () => {
            if (!contextPosition.current) return
            const id = onCreate()
            pendingCreatedPositions.current.set(id, contextPosition.current)
          },
        },
      ]}
      trigger={canvas}
    />
  )
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>((props, ref) => {
  return (
    <ReactFlowProvider>
      <TerminalCanvas {...props} handleRef={ref} />
    </ReactFlowProvider>
  )
})
