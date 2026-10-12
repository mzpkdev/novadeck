import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { clsx } from "clsx"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { areaById, atlas, nodeById, nodeTitle } from "../atlas-data.ts"
import type { RuntimeEdge, RuntimeNode } from "../atlas.ts"
import { AnchorLink } from "../components/anchor.tsx"
import { Badge, Empty, Mono } from "../components/ui.tsx"
import { areaPath } from "../links.ts"

type NodeData = { node: RuntimeNode }
type FlowNode = Node<NodeData, "atlas">

const sides = [
  { position: Position.Top, name: "top" },
  { position: Position.Right, name: "right" },
  { position: Position.Bottom, name: "bottom" },
  { position: Position.Left, name: "left" },
] as const

const AtlasNode = ({ data, selected }: NodeProps<FlowNode>) => {
  const { node } = data
  return (
    <div
      className={clsx(
        // Graphite keeps the accent for what is selected; kinds differ by line alone.
        "w-48 rounded-sm border bg-panel px-3 py-2",
        node.kind === "external"
          ? "border-dashed border-[var(--color-line-strong)]"
          : "border-solid border-[var(--color-outline)]",
        node.kind === "binary" && "border-l-4 border-l-[var(--color-line-strong)]",
        node.kind === "server" && "bg-raised",
        selected
          ? "border-accent shadow-lg outline outline-1 outline-accent"
          : "shadow-[var(--shadow-control)]",
      )}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{node.kind}</div>
      <div className="text-[13px] font-medium leading-5">{node.title}</div>
      {sides.map((s) => (
        <span key={s.name}>
          <Handle id={`in-${s.name}`} type="target" position={s.position} className="!opacity-0" />
          <Handle id={`out-${s.name}`} type="source" position={s.position} className="!opacity-0" />
        </span>
      ))}
    </div>
  )
}

const nodeTypes = { atlas: AtlasNode }

const sideFor = (from: RuntimeNode, to: RuntimeNode) => {
  const dx = to.position.x - from.position.x
  const dy = to.position.y - from.position.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"]
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"]
}

type Selection = { type: "node" | "edge"; id: string } | null

const NodePanel = ({ node, onEdge }: { node: RuntimeNode; onEdge: (id: string) => void }) => {
  const edges = atlas.runtime.edges.filter((e) => e.from === node.id || e.to === node.id)
  return (
    <>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{node.kind}</div>
      <h2 className="text-base font-semibold">{node.title}</h2>
      <p className="mt-2 text-muted">{node.summary}</p>
      <div className="mt-2 text-[12px]">
        <AnchorLink anchor={node.anchor} />
      </div>
      <h3 className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Areas
      </h3>
      {node.areas.length === 0 ? <Empty>None.</Empty> : null}
      <ul>
        {node.areas.map((id) => (
          <li key={id}>
            <Link to={areaPath(id)}>{areaById.get(id)?.title ?? id}</Link>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Edges
      </h3>
      {edges.length === 0 ? <Empty>None.</Empty> : null}
      <ul className="space-y-3">
        {edges.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onEdge(e.id)}
              className="cursor-pointer text-left hover:underline"
            >
              {nodeTitle(e.from)} to {nodeTitle(e.to)}
            </button>{" "}
            <Badge>{e.channel}</Badge>
            <p className="text-muted">{e.summary}</p>
            <div className="text-[12px]">
              <AnchorLink anchor={e.anchor} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

const EdgePanel = ({ edge }: { edge: RuntimeEdge }) => (
  <>
    <div className="font-mono text-[10px] uppercase tracking-wider text-muted">edge</div>
    <h2 className="text-base font-semibold">
      {nodeTitle(edge.from)} to {nodeTitle(edge.to)}
    </h2>
    <div className="mt-1">
      <Badge accent>{edge.channel}</Badge>
    </div>
    <p className="mt-2 text-muted">{edge.summary}</p>
    <div className="mt-2 text-[12px]">
      <AnchorLink anchor={edge.anchor} />
    </div>
  </>
)

// Edges between the same two nodes draw as one line, labelled with every channel.
const parallel = atlas.runtime.edges.reduce<[RuntimeEdge, ...RuntimeEdge[]][]>((groups, edge) => {
  const group = groups.find(([first]) => first.from === edge.from && first.to === edge.to)
  return group
    ? groups.map((each) => (each === group ? [...each, edge] : each))
    : [...groups, [edge]]
}, [])

export const MapPage = () => {
  const [params] = useSearchParams()
  const initial = params.get("node")
  const [selection, setSelection] = useState<Selection>(
    initial ? { type: "node", id: initial } : null,
  )

  const nodes = useMemo<FlowNode[]>(
    () =>
      atlas.runtime.nodes.map((node) => ({
        id: node.id,
        type: "atlas",
        position: node.position,
        data: { node },
        selected: selection?.type === "node" && selection.id === node.id,
      })),
    [selection],
  )
  const edges = useMemo<Edge[]>(
    () =>
      parallel.map(([edge, ...more]) => {
        const from = nodeById.get(edge.from)
        const to = nodeById.get(edge.to)
        const [a, b] = from && to ? sideFor(from, to) : ["right", "left"]
        const selected = selection?.type === "edge" && selection.id === edge.id
        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          sourceHandle: `out-${a}`,
          targetHandle: `in-${b}`,
          label: [edge, ...more].map((each) => each.channel).join(" · "),
          selected: selected || more.some((each) => selection?.id === each.id),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: selected ? "var(--accent)" : "var(--color-line-strong)",
          },
          style: selected
            ? { stroke: "var(--accent)", strokeWidth: 2 }
            : { stroke: "var(--color-line-strong)" },
          labelStyle: { fill: "var(--fg)", fontSize: 11, fontFamily: "var(--font-mono)" },
          labelBgStyle: { fill: "var(--panel)", stroke: "var(--line)" },
          labelBgPadding: [4, 2],
        }
      }),
    [selection],
  )

  const node = selection?.type === "node" ? nodeById.get(selection.id) : undefined
  const edge =
    selection?.type === "edge" ? atlas.runtime.edges.find((e) => e.id === selection.id) : undefined

  return (
    <div className="flex h-full">
      <div className="workspace relative min-w-0 flex-1">
        {atlas.runtime.nodes.length === 0 ? (
          <div className="p-6">
            <Empty>No runtime nodes extracted yet.</Empty>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode="system"
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, n) => setSelection({ type: "node", id: n.id })}
            onEdgeClick={(_, e) => setSelection({ type: "edge", id: e.id })}
            onPaneClick={() => setSelection(null)}
          >
            <Background color="var(--accent)" gap={18} size={1.4} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
      <aside className="w-96 shrink-0 overflow-auto border-l border-line bg-panel p-4">
        {node ? (
          <NodePanel node={node} onEdge={(id) => setSelection({ type: "edge", id })} />
        ) : null}
        {edge ? <EdgePanel edge={edge} /> : null}
        {!node && !edge ? (
          <p className="text-muted">
            Select a node or an edge. <Mono>Ctrl K</Mono> searches everything.
          </p>
        ) : null}
      </aside>
    </div>
  )
}
