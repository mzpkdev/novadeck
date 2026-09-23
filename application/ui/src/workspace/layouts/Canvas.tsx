import {
  Background,
  getNodesBounds,
  getViewportForBounds,
  NodeResizeControl,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react"
import { Maximize, Minus, Plus } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type CSSProperties,
  type ReactNode,
} from "react"

import { Tooltip } from "../../ui-toolkit/Tooltip"
import type { Session, CanvasLayout } from "../model/types"
import type { MinimizeControls } from "../terminals/Terminal"
import { backgroundPointerHandlers } from "./background"

type TerminalNode = Node<
  {
    content: ReactNode
    compactHeader: boolean
    minimized: boolean
    onResizeStart: () => void
    onResizeEnd: (width: number, height: number) => void
  },
  "terminal"
>
type CanvasProps = {
  layout: CanvasLayout
  revealOnMount: boolean
  fitOnNavigate: boolean
  onLayoutChange: Dispatch<SetStateAction<CanvasLayout>>
  sessions: Session[]
  selected: string
  navigation: number
  onSelect: (id: string) => void
  render: (session: Session, minimize: MinimizeControls) => ReactNode
}
type CanvasViewport = NonNullable<CanvasLayout["viewport"]>

const TerminalNodeView = ({ id, data, selected }: NodeProps<TerminalNode>): React.JSX.Element => (
  <div
    data-node={id}
    className={`canvas-node h-full w-full ${selected ? "selected" : ""} ${data.compactHeader ? "compact-header" : ""} ${data.minimized ? "minimized" : ""}`}
  >
    <NodeResizeControl
      position="bottom-right"
      minWidth={320}
      minHeight={data.minimized ? 0 : 200}
      {...(data.minimized ? { resizeDirection: "horizontal" as const } : {})}
      autoScale={false}
      className="terminal-resize-grip nodrag nopan"
      onResizeStart={data.onResizeStart}
      onResizeEnd={(_, { width, height }) => data.onResizeEnd(width, height)}
    >
      <span
        className="terminal-resize-pattern"
        title={data.minimized ? "Drag to resize terminal width" : "Drag to resize terminal"}
      />
    </NodeResizeControl>
    {data.content}
  </div>
)
const nodeTypes = { terminal: TerminalNodeView }
const fitOptions = { padding: 0.08, maxZoom: 1 }
const canvasStep = 24
const snap = (value: number): number => Math.round(value / canvasStep) * canvasStep
const terminalHeaderHeight = 52
// Apply half the canvas zoom strength to node headers and resize grips.
const chromeScaleAt = (zoom: number): number => 1 / Math.sqrt(zoom)
const centerOf = (node: TerminalNode, zoom: number): XYPosition => ({
  x: node.position.x + (node.width ?? 550) / 2,
  y:
    node.position.y +
    (node.data.minimized ? terminalHeaderHeight * chromeScaleAt(zoom) + 2 : (node.height ?? 400)) /
      2,
})

const TerminalCanvas = ({
  layout,
  revealOnMount,
  fitOnNavigate,
  onLayoutChange,
  sessions,
  selected,
  navigation,
  onSelect,
  render,
}: CanvasProps): React.JSX.Element => {
  const { minimized, geometry } = layout
  const { fitView, zoomIn, zoomOut, getViewport, setViewport, setCenter, getNode, setNodes } =
    useReactFlow<TerminalNode>()
  const zoom = useStore((state) => state.transform[2])
  const chromeScale = chromeScaleAt(zoom)
  const initialized = useNodesInitialized()
  const container = useRef<HTMLDivElement>(null)
  const [initialViewport] = useState(layout.viewport)
  const geometryRef = useRef<CanvasLayout["geometry"]>({ ...layout.geometry })
  const dirtyGeometry = useRef(new Set<string>())
  const resizing = useRef(new Set<string>())
  const viewportRef = useRef<CanvasViewport>(layout.viewport ?? { x: 0, y: 0, zoom: 1 })
  const dirtyViewport = useRef(false)
  const mounted = useRef(false)
  const latest = useRef({ sessions, onLayoutChange })
  // Returning to Canvas restores its camera; only new sidebar requests should recenter it.
  const lastNavigation = useRef(layout.viewport ? navigation : 0)

  useEffect(() => {
    latest.current = { sessions, onLayoutChange }
  }, [onLayoutChange, sessions])

  const commitGeometry = useCallback((ids: Iterable<string>) => {
    const { onLayoutChange: commitLayout, sessions: liveSessions } = latest.current
    const snapshots = [...ids].flatMap((id) => {
      const snapshotGeometry = geometryRef.current[id]
      if (!snapshotGeometry) return []
      const { position, width, height } = snapshotGeometry
      return [
        [
          id,
          {
            position,
            ...(width === undefined ? {} : { width }),
            ...(height === undefined ? {} : { height }),
          },
        ] as const,
      ]
    })
    if (!snapshots.length) return
    for (const [id] of snapshots) dirtyGeometry.current.delete(id)
    const liveIds = new Set(liveSessions.map((session) => session.id))
    commitLayout((previous) => {
      const nextGeometry = { ...previous.geometry }
      for (const [id, next] of snapshots) {
        if (!liveIds.has(id)) continue
        nextGeometry[id] = next
      }
      return { ...previous, geometry: nextGeometry }
    })
  }, [])

  const trackViewport = useCallback((viewport: CanvasViewport) => {
    viewportRef.current = { ...viewport }
    dirtyViewport.current = true
  }, [])

  const commitViewport = useCallback(() => {
    if (!dirtyViewport.current) return
    const { onLayoutChange: commitLayout } = latest.current
    const viewport = { ...viewportRef.current }
    dirtyViewport.current = false
    commitLayout((previous) =>
      previous.viewport?.x === viewport.x &&
      previous.viewport.y === viewport.y &&
      previous.viewport.zoom === viewport.zoom
        ? previous
        : { ...previous, viewport },
    )
  }, [])

  const updateNode = useCallback(
    (id: string, update: (node: TerminalNode) => TerminalNode) => {
      setNodes((nodes) => nodes.map((item) => (item.id === id ? update(item) : item)))
    },
    [setNodes],
  )

  const beginResize = useCallback(
    (id: string) => {
      resizing.current.add(id)
      const currentNode = getNode(id)
      if (currentNode) {
        geometryRef.current[id] = {
          ...geometryRef.current[id],
          position: currentNode.position,
          ...(currentNode.width ? { width: currentNode.width } : {}),
          ...(!currentNode.data.minimized && currentNode.height
            ? { height: currentNode.height }
            : {}),
        }
      }
      updateNode(id, (node) => ({ ...node, className: "resizing" }))
    },
    [getNode, updateNode],
  )

  const finishResize = useCallback(
    (id: string, width: number, height: number) => {
      if (!resizing.current.has(id)) return
      const currentNode = getNode(id)
      if (!currentNode) return
      resizing.current.delete(id)
      const isMinimized = currentNode.data.minimized
      const next = {
        ...geometryRef.current[id],
        position: currentNode.position,
        width: Math.max(336, snap(width)),
        ...(!isMinimized ? { height: Math.max(216, snap(height)) } : {}),
      }
      geometryRef.current[id] = next
      dirtyGeometry.current.add(id)
      updateNode(id, (current) => ({
        ...current,
        width: next.width,
        ...(!isMinimized ? { height: next.height } : {}),
        className: "",
      }))
      commitGeometry([id])
    },
    [commitGeometry, getNode, updateNode],
  )

  const nodeFrom = useCallback(
    (session: Session, source: CanvasLayout["geometry"][string] | undefined): TerminalNode => {
      const isMinimized = minimized[session.id] ?? false
      const width = source?.width ?? 550
      return {
        id: session.id,
        type: "terminal",
        position: source?.position ?? { x: session.x, y: session.y },
        width,
        height: isMinimized
          ? terminalHeaderHeight * chromeScale + 2
          : Math.max(source?.height ?? session.height, (terminalHeaderHeight + 4) * chromeScale),
        dragHandle: ".terminal-header",
        draggable: selected === session.id,
        selected: selected === session.id,
        ariaLabel: `${session.name} terminal`,
        data: {
          content: render(session, {
            minimized: isMinimized,
            onToggle: () =>
              onLayoutChange((previous) => ({
                ...previous,
                minimized: { ...previous.minimized, [session.id]: !previous.minimized[session.id] },
              })),
          }),
          compactHeader: width / chromeScale < 240,
          minimized: isMinimized,
          onResizeStart: () => beginResize(session.id),
          onResizeEnd: (nextWidth, nextHeight) => finishResize(session.id, nextWidth, nextHeight),
        },
      }
    },
    [beginResize, chromeScale, finishResize, minimized, onLayoutChange, render, selected],
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
          position: { x: session.x, y: session.y },
        }
    }
    setNodes((previous) => {
      const existing = new Map(previous.map((node) => [node.id, node]))
      return sessions.map((session) => {
        const next = nodeFrom(session, geometry[session.id])
        const current = existing.get(session.id)
        if (!current || !dirtyGeometry.current.has(session.id)) return next
        const retained = {
          ...next,
          position: current.position,
          width: current.width ?? next.width ?? 550,
          height: current.height ?? next.height ?? session.height,
        }
        return current.className ? { ...retained, className: current.className } : retained
      })
    })
  }, [geometry, nodeFrom, sessions, setNodes])

  useEffect(() => {
    if (!dirtyViewport.current && layout.viewport) viewportRef.current = { ...layout.viewport }
  }, [layout.viewport])

  useEffect(
    () => () => {
      const ids = [...dirtyGeometry.current]
      for (const id of ids) {
        const current = geometryRef.current[id]
        if (!current) continue
        const isResizing = resizing.current.has(id)
        const isMinimized = getNode(id)?.data.minimized ?? false
        geometryRef.current[id] = {
          ...current,
          position: { x: snap(current.position.x), y: snap(current.position.y) },
          ...(isResizing && current.width ? { width: Math.max(336, snap(current.width)) } : {}),
          ...(isResizing && !isMinimized && current.height
            ? { height: Math.max(216, snap(current.height)) }
            : {}),
        }
      }
      resizing.current.clear()
      commitGeometry(ids)
      if (dirtyViewport.current) {
        trackViewport(getViewport())
        commitViewport()
      }
    },
    [commitGeometry, commitViewport, getNode, getViewport, trackViewport],
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const onNodesChange: OnNodesChange<TerminalNode> = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "position" && change.position && !resizing.current.has(change.id)) {
          if (change.dragging) {
            geometryRef.current[change.id] = {
              ...geometryRef.current[change.id],
              position: change.position,
            }
            dirtyGeometry.current.add(change.id)
          } else if (dirtyGeometry.current.has(change.id)) {
            const position = { x: snap(change.position.x), y: snap(change.position.y) }
            geometryRef.current[change.id] = { ...geometryRef.current[change.id], position }
            updateNode(change.id, (node) => ({ ...node, position }))
            commitGeometry([change.id])
          }
        }
        if (change.type === "dimensions" && change.dimensions && resizing.current.has(change.id)) {
          const current = geometryRef.current[change.id]
          const isMinimized = getNode(change.id)?.data.minimized ?? false
          geometryRef.current[change.id] = {
            ...current,
            position: current?.position ?? getNode(change.id)?.position ?? { x: 0, y: 0 },
            width: change.dimensions.width,
            ...(!isMinimized ? { height: change.dimensions.height } : {}),
          }
          dirtyGeometry.current.add(change.id)
          if (change.resizing === false)
            finishResize(change.id, change.dimensions.width, change.dimensions.height)
        }
        if (change.type === "select" && change.selected) onSelect(change.id)
      }
    },
    [commitGeometry, finishResize, getNode, onSelect, updateNode],
  )

  const moveNode = useCallback(
    (id: string, position: XYPosition) => {
      geometryRef.current[id] = { ...geometryRef.current[id], position }
      dirtyGeometry.current.add(id)
      updateNode(id, (node) => ({ ...node, position }))
      commitGeometry([id])
    },
    [commitGeometry, updateNode],
  )

  useEffect(() => {
    if (!initialized || navigation === lastNavigation.current || !getNode(selected)) return
    lastNavigation.current = navigation
    const node = getNode(selected)
    if (!node) return
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180
    if (fitOnNavigate) {
      void fitView({
        ...fitOptions,
        nodes: [{ id: selected }],
        maxZoom: 1.5,
        duration,
      })
      return
    }
    const targetZoom = getViewport().zoom
    const center = centerOf(node, targetZoom)
    void setCenter(center.x, center.y, { zoom: targetZoom, duration, interpolate: "linear" })
  }, [initialized, navigation, selected, fitOnNavigate, fitView, getNode, getViewport, setCenter])

  return (
    <div
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
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLElement
        if (!target.matches(".react-flow__node")) return
        const directions: Record<string, XYPosition> = {
          ArrowLeft: { x: -1, y: 0 },
          ArrowRight: { x: 1, y: 0 },
          ArrowUp: { x: 0, y: -1 },
          ArrowDown: { x: 0, y: 1 },
        }
        const direction = directions[event.key]
        const node = getNode(target.dataset.id ?? "")
        if (!direction || !node?.selected) return
        event.preventDefault()
        event.stopPropagation()
        const step = canvasStep * (event.shiftKey ? 4 : 1)
        moveNode(node.id, {
          x: node.position.x + direction.x * step,
          y: node.position.y + direction.y * step,
        })
      }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("input, button, .react-flow__node")) return
        const steps: Record<string, XYPosition> = {
          ArrowLeft: { x: 60, y: 0 },
          ArrowRight: { x: -60, y: 0 },
          ArrowUp: { x: 0, y: 60 },
          ArrowDown: { x: 0, y: -60 },
        }
        const step = steps[event.key]
        if (step) {
          event.preventDefault()
          const viewport = getViewport()
          void setViewport({ ...viewport, x: viewport.x + step.x, y: viewport.y + step.y })
        }
        if (event.key === "+" || event.key === "=") void zoomIn()
        if (event.key === "-") void zoomOut()
        if (event.key === "0") void fitView(fitOptions)
      }}
    >
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
        nodesConnectable={false}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        minZoom={0.15}
        maxZoom={1.5}
        defaultViewport={initialViewport ?? { x: 0, y: 0, zoom: 1 }}
        onInit={(instance) => {
          if (!container.current || (initialViewport && !revealOnMount)) return
          const target = navigation ? instance.getNode(selected) : undefined
          if (initialViewport && target && !fitOnNavigate) {
            const center = centerOf(target, initialViewport.zoom)
            lastNavigation.current = navigation
            void instance.setCenter(center.x, center.y, { zoom: initialViewport.zoom })
            return
          }
          const bounds = getNodesBounds(target ? [target] : instance.getNodes())
          lastNavigation.current = navigation
          // Compute the first camera before a view-transition snapshot, without waiting for paint.
          void instance.setViewport(
            getViewportForBounds(
              bounds,
              container.current.clientWidth,
              container.current.clientHeight,
              0.15,
              target && fitOnNavigate ? 1.5 : fitOptions.maxZoom,
              fitOptions.padding,
            ),
          )
        }}
        onMoveStart={(_, viewport) => trackViewport(viewport)}
        onMove={(_, viewport) => trackViewport(viewport)}
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
        panOnScroll
        panOnScrollSpeed={1}
        zoomOnScroll={false}
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
      <div className="canvas-controls max-[701px]:right-3.5 max-[701px]:bottom-4.5 absolute right-6 bottom-5 z-10 flex items-center gap-0.5 rounded-control border border-line bg-paper p-0.5 shadow-control">
        <Tooltip content="Zoom out (−)">
          <button className="icon-button" aria-label="Zoom out" onClick={() => void zoomOut()}>
            <Minus size={15} />
          </button>
        </Tooltip>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Tooltip content="Zoom in (+)">
          <button className="icon-button" aria-label="Zoom in" onClick={() => void zoomIn()}>
            <Plus size={15} />
          </button>
        </Tooltip>
        <div className="control-divider mx-0.5 h-3 w-px bg-line" />
        <Tooltip content="Fit all terminals (0)">
          <button
            className="icon-button"
            aria-label="Fit all terminals"
            onClick={() => void fitView(fitOptions)}
          >
            <Maximize size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

export const Canvas = (props: CanvasProps): React.JSX.Element => (
  <ReactFlowProvider>
    <TerminalCanvas {...props} />
  </ReactFlowProvider>
)
