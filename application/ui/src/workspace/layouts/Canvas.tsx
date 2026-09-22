import {
  Background,
  getNodesBounds,
  getViewportForBounds,
  NodeResizeControl,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useViewport,
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

import type { Session, CanvasLayout } from "../model/types"
import type { MinimizeControls } from "../terminals/Terminal"
import { backgroundPointerHandlers } from "./background"

type TerminalNode = Node<
  { content: ReactNode; compactHeader: boolean; minimized: boolean },
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
  const { fitView, zoomIn, zoomOut, getViewport, setViewport, setCenter, getNode } =
    useReactFlow<TerminalNode>()
  const { zoom } = useViewport()
  const chromeScale = chromeScaleAt(zoom)
  const initialized = useNodesInitialized()
  const container = useRef<HTMLDivElement>(null)
  const [initialViewport] = useState(layout.viewport)
  // Returning to Canvas restores its camera; only new sidebar requests should recenter it.
  const lastNavigation = useRef(layout.viewport ? navigation : 0)

  const nodes: TerminalNode[] = sessions.map((session) => {
    const compactHeader = (geometry[session.id]?.width ?? 550) / chromeScale < 240
    const isMinimized = minimized[session.id] ?? false
    return {
      id: session.id,
      type: "terminal",
      position: { x: session.x, y: session.y },
      width: 550,
      ...geometry[session.id],
      height: isMinimized
        ? terminalHeaderHeight * chromeScale + 2
        : Math.max(
            geometry[session.id]?.height ?? session.height,
            (terminalHeaderHeight + 4) * chromeScale,
          ),
      className: geometry[session.id]?.resizing ? "resizing" : "",
      dragHandle: ".terminal-header",
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
        compactHeader,
        minimized: isMinimized,
      },
    }
  })

  const onNodesChange: OnNodesChange<TerminalNode> = useCallback(
    (changes) => {
      const updates = changes.filter(
        (change) => change.type === "position" || change.type === "dimensions",
      )
      if (updates.length)
        onLayoutChange((previous) => {
          const next = { ...previous.geometry }
          for (const change of updates) {
            const session = sessions.find((item) => item.id === change.id)
            if (!session) continue
            const current = next[change.id] ?? { position: { x: session.x, y: session.y } }
            next[change.id] =
              change.type === "dimensions"
                ? {
                    ...current,
                    measured: change.dimensions ?? current.measured ?? {},
                    resizing: change.resizing ?? current.resizing ?? false,
                    ...(change.resizing === false && change.dimensions
                      ? {
                          width: Math.max(336, snap(change.dimensions.width)),
                          ...(!previous.minimized[change.id]
                            ? { height: Math.max(216, snap(change.dimensions.height)) }
                            : {}),
                        }
                      : {}),
                    ...(change.dimensions &&
                    (change.setAttributes === true || change.setAttributes === "width")
                      ? { width: change.dimensions.width }
                      : {}),
                    ...(change.dimensions &&
                    !previous.minimized[change.id] &&
                    (change.setAttributes === true || change.setAttributes === "height")
                      ? { height: change.dimensions.height }
                      : {}),
                  }
                : {
                    ...current,
                    position:
                      change.dragging === false && current.dragging && change.position
                        ? { x: snap(change.position.x), y: snap(change.position.y) }
                        : (change.position ?? current.position),
                    dragging: change.dragging ?? current.dragging ?? false,
                  }
          }
          return { ...previous, geometry: next }
        })
      for (const change of changes) {
        if (change.type === "select" && change.selected) onSelect(change.id)
      }
    },
    [onSelect, onLayoutChange, sessions],
  )

  useEffect(() => {
    if (!initialized || navigation === lastNavigation.current || !getNode(selected)) return
    lastNavigation.current = navigation
    const node = getNode(selected)
    if (!node) return
    if (fitOnNavigate) {
      void fitView({
        ...fitOptions,
        nodes: [{ id: selected }],
        maxZoom: 1.5,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
      })
      return
    }
    const targetZoom = getViewport().zoom
    const center = centerOf(node, targetZoom)
    void setCenter(center.x, center.y, { zoom: targetZoom })
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
        onNodesChange([
          {
            id: node.id,
            type: "position",
            position: {
              x: snap(node.position.x + direction.x * step),
              y: snap(node.position.y + direction.y * step),
            },
          },
        ])
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
        nodes={nodes}
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
        onViewportChange={(viewport) => onLayoutChange((previous) => ({ ...previous, viewport }))}
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
        <button className="icon-button" aria-label="Zoom out" onClick={() => void zoomOut()}>
          <Minus size={15} />
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className="icon-button" aria-label="Zoom in" onClick={() => void zoomIn()}>
          <Plus size={15} />
        </button>
        <div className="control-divider mx-0.5 h-3 w-px bg-line" />
        <button
          className="icon-button"
          aria-label="Fit all terminals"
          title="Fit all terminals (0)"
          onClick={() => void fitView(fitOptions)}
        >
          <Maximize size={15} />
        </button>
      </div>
    </div>
  )
}

export const Canvas = (props: CanvasProps): React.JSX.Element => (
  <ReactFlowProvider>
    <TerminalCanvas {...props} />
  </ReactFlowProvider>
)
