import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react"
import type { Edge } from "@xyflow/react"
import { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router"

import { atlas, tableByName } from "../atlas-data.ts"
import { Page } from "../components/ui.tsx"
import { StorageStrip } from "./data/chips.tsx"
import { NODE_W, nodeHeight, positions, relations } from "./data/model.ts"
import type { TableNode } from "./data/model.ts"
import { TablePanel } from "./data/panel.tsx"
import { TableBox } from "./data/table-node.tsx"

import "./visual-tokens.css"

const nodeTypes = { table: TableBox }
const RELS = relations()
const POS = positions()

const Canvas = ({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (n: string | null) => void
}) => {
  const flow = useReactFlow()
  const nodes: TableNode[] = useMemo(() => {
    const near = new Set(
      RELS.flatMap((r) => (r.from === selected || r.to === selected ? [r.from, r.to] : [])),
    )
    return atlas.data.tables.map((table) => ({
      id: table.name,
      type: "table",
      position: POS.get(table.name) ?? { x: 0, y: 0 },
      data: { table, selected: table.name === selected, related: near.has(table.name) },
      draggable: true,
    }))
  }, [selected])

  const edges: Edge[] = useMemo(
    () =>
      RELS.map((r) => {
        const a = POS.get(r.from)?.x ?? 0
        const b = POS.get(r.to)?.x ?? 0
        const [sSide, tSide] = a < b ? ["r", "l"] : a > b ? ["l", "r"] : ["r", "r"]
        const hot = selected !== null && (r.from === selected || r.to === selected)
        return {
          id: r.id,
          source: r.from,
          target: r.to,
          sourceHandle: `${r.fromCol}-${sSide}`,
          targetHandle: `${r.toCol}-${tSide}`,
          type: "default",
          animated: false,
          style: {
            stroke: hot ? "var(--accent)" : "var(--color-line-strong)",
            strokeWidth: hot ? 1.8 : 1.2,
            strokeDasharray: r.implied ? "4 4" : undefined,
            opacity: selected && !hot ? 0.25 : 1,
          },
        }
      }),
    [selected],
  )

  useEffect(() => {
    if (!selected) return
    const p = POS.get(selected)
    const t = tableByName.get(selected)
    if (p && t)
      flow.setCenter(p.x + NODE_W / 2 + 170 / flow.getZoom(), p.y + nodeHeight(t) / 2, {
        zoom: flow.getZoom(),
        duration: 300,
      })
  }, [selected, flow])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      connectionMode={ConnectionMode.Loose}
      fitView
      fitViewOptions={{ padding: 0.08 }}
      minZoom={0.3}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--accent)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

// A sample of the line the diagram draws for a kind of relation.
const line = (dash?: string) => (
  <svg width="22" height="6">
    <line
      x1="0"
      x2="22"
      y1="3"
      y2="3"
      stroke="var(--color-line-strong)"
      strokeWidth="1.5"
      strokeDasharray={dash}
    />
  </svg>
)

export const DataPage = () => {
  const { hash } = useLocation()
  const id = decodeURIComponent(hash.slice(1))
  const [picked, setPicked] = useState<{ hash: string; name: string | null } | null>(null)
  const selected = picked?.hash === id ? picked.name : id.startsWith("table:") ? id.slice(6) : null
  const setSelected = (name: string | null) => setPicked({ hash: id, name })
  const table = selected ? (tableByName.get(selected) ?? null) : null
  return (
    <Page
      title="Data"
      flush
      tools={
        <span className="flex items-center gap-4 text-caption text-muted">
          <span className="flex items-center gap-1">
            {line()}
            foreign key
          </span>
          <span className="flex items-center gap-1">
            {line("4 3")}
            implied by name
          </span>
        </span>
      }
    >
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <ReactFlowProvider>
            <Canvas selected={selected} onSelect={setSelected} />
          </ReactFlowProvider>
          {table ? (
            <div className="absolute inset-y-0 right-0 z-10 flex shadow-lg">
              <TablePanel table={table} onClose={() => setSelected(null)} />
            </div>
          ) : null}
        </div>
      </div>
      <StorageStrip
        initial={id.startsWith("setting:") ? "settings" : id.startsWith("local:") ? "local" : null}
      />
    </Page>
  )
}
