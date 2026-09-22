import {
  Background,
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
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import type { Session } from "./sessions"
import type { MinimizeControls } from "./Terminal"

type TerminalNode = Node<
  { content: ReactNode; compactHeader: boolean; minimized: boolean },
  "terminal"
>
type CanvasProps = {
  sessions: Session[]
  selected: string
  navigation: number
  onSelect: (id: string) => void
  render: (session: Session, minimize: MinimizeControls) => ReactNode
}

const TerminalNodeView = ({ id, data, selected }: NodeProps<TerminalNode>): React.JSX.Element => (
  <div
    data-node={id}
    className={`canvas-node ${selected ? "selected" : ""} ${data.compactHeader ? "compact-header" : ""} ${data.minimized ? "minimized" : ""}`}
  >
    {!data.minimized && (
      <NodeResizeControl
        position="bottom-right"
        minWidth={320}
        minHeight={200}
        autoScale={false}
        className="terminal-resize-grip nopan"
      >
        <span className="terminal-resize-pattern" title="Drag to resize terminal" />
      </NodeResizeControl>
    )}
    {data.content}
  </div>
)
const nodeTypes = { terminal: TerminalNodeView }
const fitOptions = { padding: 0.08, maxZoom: 1 }
const terminalHeaderHeight = 52
// Apply half the canvas zoom strength to node headers and resize grips.
const chromeScaleAt = (zoom: number): number => 1 / Math.sqrt(zoom)

const TerminalCanvas = ({
  sessions,
  selected,
  navigation,
  onSelect,
  render,
}: CanvasProps): React.JSX.Element => {
  const [minimized, setMinimized] = useState<Record<string, boolean>>({})
  const [geometry, setGeometry] = useState<
    Record<string, Pick<TerminalNode, "position" | "measured" | "dragging" | "width" | "height">>
  >({})
  const { fitView, zoomIn, zoomOut, getViewport, setViewport, setCenter, getNode } =
    useReactFlow<TerminalNode>()
  const { zoom } = useViewport()
  const chromeScale = chromeScaleAt(zoom)
  const initialized = useNodesInitialized()
  const lastNavigation = useRef(0)

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
      dragHandle: ".terminal-header",
      selected: selected === session.id,
      ariaLabel: `${session.name} terminal`,
      data: {
        content: render(session, {
          minimized: isMinimized,
          onToggle: () =>
            setMinimized((previous) => ({
              ...previous,
              [session.id]: !previous[session.id],
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
        setGeometry((previous) => {
          const next = { ...previous }
          for (const change of updates) {
            const session = sessions.find((item) => item.id === change.id)
            if (!session) continue
            const current = next[change.id] ?? { position: { x: session.x, y: session.y } }
            next[change.id] =
              change.type === "dimensions"
                ? {
                    ...current,
                    measured: change.dimensions ?? current.measured ?? {},
                    ...(change.dimensions &&
                    (change.setAttributes === true || change.setAttributes === "width")
                      ? { width: change.dimensions.width }
                      : {}),
                    ...(change.dimensions &&
                    (change.setAttributes === true || change.setAttributes === "height")
                      ? { height: change.dimensions.height }
                      : {}),
                  }
                : {
                    ...current,
                    position: change.position ?? current.position,
                    dragging: change.dragging ?? current.dragging ?? false,
                  }
          }
          return next
        })
      for (const change of changes) {
        if (change.type === "select" && change.selected) onSelect(change.id)
      }
    },
    [onSelect, sessions],
  )

  useEffect(() => {
    if (!initialized || navigation === lastNavigation.current || !getNode(selected)) return
    lastNavigation.current = navigation
    let cancelled = false
    void fitView({ ...fitOptions, nodes: [{ id: selected }] }).then(() => {
      const node = getNode(selected)
      if (cancelled || !node?.data.minimized) return
      const targetZoom = getViewport().zoom
      const width = node.width ?? 550
      const targetChromeScale = chromeScaleAt(targetZoom)
      const height = terminalHeaderHeight * targetChromeScale + 2
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: targetZoom,
      })
    })
    return () => {
      cancelled = true
    }
  }, [initialized, navigation, selected, getNode, fitView, getViewport, setCenter])

  return (
    <div
      className="canvas-viewport"
      style={
        {
          "--canvas-chrome-scale": chromeScale,
          "--canvas-header-height": `${terminalHeaderHeight}px`,
        } as CSSProperties
      }
      aria-label="Terminal canvas"
      tabIndex={0}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return
        const canvas = event.currentTarget
        const bounds = canvas.getBoundingClientRect()
        canvas.style.setProperty("--canvas-pointer-x", `${event.clientX - bounds.left}px`)
        canvas.style.setProperty(
          "--canvas-pointer-y",
          `${event.clientY - bounds.top - canvas.clientTop}px`,
        )
        canvas.dataset.pointerInside = "true"
      }}
      onPointerLeave={(event) => {
        delete event.currentTarget.dataset.pointerInside
      }}
      onPointerCancel={(event) => {
        delete event.currentTarget.dataset.pointerInside
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
        fitView
        fitViewOptions={fitOptions}
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
          gap={24}
          size={1.6}
          color="var(--color-muted)"
          bgColor="transparent"
        />
        <Background
          id="grid-spotlight"
          className="canvas-grid-spotlight"
          gap={24}
          size={1.6}
          color="var(--color-muted)"
          bgColor="transparent"
        />
      </ReactFlow>
      <div className="canvas-controls">
        <button className="icon-button" aria-label="Zoom out" onClick={() => void zoomOut()}>
          <Minus size={15} />
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className="icon-button" aria-label="Zoom in" onClick={() => void zoomIn()}>
          <Plus size={15} />
        </button>
        <div className="control-divider" />
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
