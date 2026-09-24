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

import type { SizePreset, Session, CanvasLayout } from "../model/types"
import type { MinimizeControls } from "../terminals/Terminal"
import { backgroundPointerHandlers } from "./background"
import { createCanvasVisit } from "./canvas-visit"
import { canvasPresetSize } from "./terminal-size"
import { useTerminalVisibility } from "./useTerminalVisibility"

type TerminalNode = Node<
  {
    content: ReactNode
    compactHeader: boolean
    minimized: boolean
    hiding: boolean
    preview: boolean
    placing: boolean
    onResizeStart: () => void
    onResizeEnd: (width: number, height: number) => void
  },
  "terminal"
>
type CanvasProps = {
  presets: Record<string, SizePreset>
  onPresetChange: (id: string, preset: SizePreset) => void
  layout: CanvasLayout
  revealOnMount: boolean
  fitOnNavigate: boolean
  onLayoutChange: Dispatch<SetStateAction<CanvasLayout>>
  sessions: Session[]
  hidden: Record<string, boolean>
  preview: string
  selected: string
  navigation: number
  placement?: string
  onPlace?: () => void
  onSelect: (id: string) => void
  render: (
    session: Session,
    minimize: MinimizeControls,
    onFlyTo: () => void,
    resize: () => void,
  ) => ReactNode
}
type CanvasViewport = NonNullable<CanvasLayout["viewport"]>

const TerminalNodeView = ({ id, data, selected }: NodeProps<TerminalNode>): React.JSX.Element => (
  <div
    data-node={id}
    data-preview={data.preview}
    style={data.placing ? { opacity: 0.75 } : undefined}
    inert={data.hiding}
    aria-hidden={data.hiding}
    className={`canvas-node h-full w-full ${selected ? "selected" : ""} ${data.compactHeader ? "compact-header" : ""} ${data.minimized ? "minimized" : ""}`}
  >
    <div className="terminal-visibility relative h-full w-full" data-hiding={data.hiding}>
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
  presets,
  onPresetChange,
  layout,
  revealOnMount,
  fitOnNavigate,
  onLayoutChange,
  sessions,
  hidden,
  preview,
  selected,
  navigation,
  placement,
  onPlace,
  onSelect,
  render,
}: CanvasProps): React.JSX.Element => {
  const { minimized, geometry } = layout
  const removed = useTerminalVisibility(hidden)
  const {
    fitView,
    zoomIn,
    zoomOut,
    getViewport,
    setViewport,
    setCenter,
    getNode,
    setNodes,
    screenToFlowPosition,
  } = useReactFlow<TerminalNode>()
  const zoom = useStore((state) => state.transform[2])
  const viewportWidth = useStore((state) => state.width)
  const viewportHeight = useStore((state) => state.height)
  const maxZoom = Math.max(
    1.5,
    layout.viewport?.zoom ?? 1,
    Math.min(viewportWidth / 320, viewportHeight / 200),
  )
  const chromeScale = chromeScaleAt(zoom)
  const initialized = useNodesInitialized()
  const container = useRef<HTMLDivElement>(null)
  const [initialViewport] = useState(layout.viewport)
  const [visit] = useState(createCanvasVisit)
  const geometryRef = useRef<CanvasLayout["geometry"]>({ ...layout.geometry })
  const dirtyGeometry = useRef(new Set<string>())
  const resizing = useRef(new Set<string>())
  const viewportRef = useRef<CanvasViewport>(layout.viewport ?? { x: 0, y: 0, zoom: 1 })
  const dirtyViewport = useRef(false)
  const mounted = useRef(false)
  const latest = useRef({ sessions, onLayoutChange })
  // Returning to Canvas restores its camera; only new sidebar requests should recenter it.
  const lastNavigation = useRef(layout.viewport ? navigation : 0)
  const placementPosition = useRef<XYPosition | null>(null)
  const placementPointer = useRef<XYPosition | null>(null)
  const lastPlacement = useRef(placement)
  const fitAll = useCallback((): void => {
    visit.clear()
    void fitView({
      ...fitOptions,
      nodes: sessions
        .filter((session) => !hidden[session.id])
        .map((session) => ({ id: session.id })),
    })
  }, [fitView, sessions, hidden, visit])
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

  const resizeToViewport = useCallback(
    (id: string) => {
      const node = getNode(id)
      if (!node || !viewportWidth || !viewportHeight) return
      const preset = presets[id] === "large" ? "small" : "large"
      const { width, height } = canvasPresetSize(preset)
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
    (session: Session) => {
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
            ? (geometry[session.id]?.height ?? session.height)
            : (node.height ?? session.height),
        },
        viewportWidth,
        viewportHeight,
        0,
        Infinity,
        0,
      )
      const flight = visit.begin(session.id, getViewport(), viewport)
      if (!flight) return
      void setViewport(flight.viewport, {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350,
      }).then(
        (completed) => visit.finish(flight, completed),
        () => visit.finish(flight, false),
      )
    },
    [
      geometry,
      getNode,
      getViewport,
      onLayoutChange,
      onSelect,
      setViewport,
      viewportHeight,
      viewportWidth,
      visit,
    ],
  )

  const nodeFrom = useCallback(
    (session: Session, source: CanvasLayout["geometry"][string] | undefined): TerminalNode => {
      const isMinimized = minimized[session.id] ?? false
      const width = source?.width ?? 550
      const placing = placement === session.id
      return {
        id: session.id,
        type: "terminal",
        hidden: placing ? true : (removed[session.id] ?? false),
        position: source?.position ?? { x: session.x, y: session.y },
        width,
        height: isMinimized
          ? terminalHeaderHeight * chromeScale + 2
          : Math.max(source?.height ?? session.height, (terminalHeaderHeight + 4) * chromeScale),
        dragHandle: ".terminal-header",
        draggable: !placement && selected === session.id && !hidden[session.id],
        selectable: !placement && !hidden[session.id],
        focusable: !placement && !hidden[session.id],
        selected: selected === session.id,
        ariaLabel: `${session.name} terminal`,
        ...(placement
          ? { style: { pointerEvents: "none", ...(placing ? { transition: "none" } : {}) } }
          : {}),
        data: {
          preview: placing || preview === session.id,
          placing,
          hiding: hidden[session.id] ?? false,
          content: render(
            session,
            {
              minimized: isMinimized,
              onToggle: () =>
                onLayoutChange((previous) => ({
                  ...previous,
                  minimized: {
                    ...previous.minimized,
                    [session.id]: !previous.minimized[session.id],
                  },
                })),
            },
            () => flyTo(session),
            () => resizeToViewport(session.id),
          ),
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
      flyTo,
      resizeToViewport,
      hidden,
      preview,
      removed,
      minimized,
      onLayoutChange,
      placement,
      render,
      selected,
    ],
  )

  // XYFlow owns pointer-time geometry so dragging does not rerender the application or terminals.
  // Parent updates refresh terminal content and selection while retaining any in-progress gesture.
  useEffect(() => {
    if (lastPlacement.current === placement) return
    placementPosition.current = null
    placementPointer.current = null
    lastPlacement.current = placement
  }, [placement])

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
        const base = nodeFrom(session, geometry[session.id])
        const next =
          session.id === placement && placementPosition.current
            ? { ...base, hidden: false, position: placementPosition.current }
            : base
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
  }, [geometry, nodeFrom, placement, sessions, setNodes])

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

  const positionAt = useCallback(
    (clientX: number, clientY: number): XYPosition => {
      const point = screenToFlowPosition({ x: clientX, y: clientY })
      const node = placement ? getNode(placement) : undefined
      return {
        x: snap(point.x - (node?.width ?? 550) / 2),
        y: snap(point.y - (node?.height ?? 400) / 2),
      }
    },
    [getNode, placement, screenToFlowPosition],
  )

  const previewPlacement = useCallback(
    (clientX: number, clientY: number) => {
      if (!placement) return
      placementPointer.current = { x: clientX, y: clientY }
      const position = positionAt(clientX, clientY)
      placementPosition.current = position
      updateNode(placement, (node) => ({ ...node, hidden: false, position }))
    },
    [placement, positionAt, updateNode],
  )

  const hidePlacement = useCallback(() => {
    placementPointer.current = null
    if (!placement || !placementPosition.current) return
    placementPosition.current = null
    updateNode(placement, (node) => ({ ...node, hidden: true }))
  }, [placement, updateNode])

  useEffect(() => {
    if (selected === placement && placement) {
      lastNavigation.current = navigation
      return
    }
    if (
      !initialized ||
      navigation === lastNavigation.current ||
      hidden[selected] ||
      !getNode(selected)
    )
      return
    const node = getNode(selected)
    if (!node || node.hidden) return
    lastNavigation.current = navigation
    visit.clear()
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
  }, [
    initialized,
    navigation,
    selected,
    placement,
    hidden,
    fitOnNavigate,
    fitView,
    getNode,
    getViewport,
    setCenter,
    visit,
  ])

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
      onPointerMoveCapture={(event) => {
        if (event.pointerType === "touch" || !placement) return
        if (!(event.target as HTMLElement).closest(".react-flow")) {
          hidePlacement()
          return
        }
        previewPlacement(event.clientX, event.clientY)
      }}
      onClickCapture={(event) => {
        if (!placement || !(event.target as HTMLElement).closest(".react-flow")) return
        event.stopPropagation()
        const position = positionAt(event.clientX, event.clientY)
        placementPosition.current = null
        moveNode(placement, position)
        onPlace?.()
      }}
      onPointerLeave={(event) => {
        backgroundPointerHandlers.onPointerLeave(event)
        hidePlacement()
      }}
      onPointerCancel={(event) => {
        backgroundPointerHandlers.onPointerCancel(event)
        hidePlacement()
      }}
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
        if (event.key === "+" || event.key === "=") {
          visit.clear()
          void zoomIn()
        }
        if (event.key === "-") {
          visit.clear()
          void zoomOut()
        }
        if (event.key === "0") fitAll()
      }}
    >
      <ReactFlow<TerminalNode>
        defaultNodes={sessions.map((session) => nodeFrom(session, geometry[session.id]))}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          if (!placement) onSelect(node.id)
        }}
        onPaneClick={(event) => {
          if (placement) return
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
        maxZoom={maxZoom}
        defaultViewport={initialViewport ?? { x: 0, y: 0, zoom: 1 }}
        onInit={(instance) => {
          if (!container.current || (initialViewport && !revealOnMount)) return
          const selectedNode =
            navigation && selected !== placement ? instance.getNode(selected) : undefined
          const target = selectedNode?.hidden ? undefined : selectedNode
          if (initialViewport && target && !fitOnNavigate) {
            const center = centerOf(target, initialViewport.zoom)
            lastNavigation.current = navigation
            void instance.setCenter(center.x, center.y, { zoom: initialViewport.zoom })
            return
          }
          const visible = instance.getNodes().filter((node) => !node.hidden)
          if (!visible.length) return
          const bounds = getNodesBounds(target ? [target] : visible)
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
          const pointer = placementPointer.current
          if (pointer) previewPlacement(pointer.x, pointer.y)
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
    </div>
  )
}

export const Canvas = (props: CanvasProps): React.JSX.Element => (
  <ReactFlowProvider>
    <TerminalCanvas {...props} />
  </ReactFlowProvider>
)
