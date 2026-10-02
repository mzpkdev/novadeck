import { NodeResizeControl, type NodeProps } from "@xyflow/react"
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"

import { useDropPreview } from "../../terminals/drop-space"
import type { TerminalNode } from "./types"

// Terminal content comes from the canvas's current render, not from node data: node data
// reaches XYFlow a commit later, which would briefly show controlled inputs stale values.
export const TerminalContent = createContext<(id: string) => ReactNode>(() => null)

const TerminalNodeView = ({ id, data, selected }: NodeProps<TerminalNode>): React.JSX.Element => {
  const contentOf = useContext(TerminalContent)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (data.focusRequest === null) return
    content.current?.closest<HTMLElement>(".react-flow__node")?.focus({ preventScroll: true })
  }, [data.focusRequest])
  return (
    <div
      ref={content}
      data-workspace-canvas-node
      data-node={id}
      data-preview={data.preview}
      inert={data.hiding}
      aria-hidden={data.hiding}
      className={`canvas-node h-full w-full ${selected ? "selected" : ""} ${data.compactHeader ? "compact-header" : ""} ${data.minimized ? "minimized" : ""}`}
      onContextMenu={(event) => event.stopPropagation()}
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
          <span className="terminal-resize-pattern" title="Resize" />
        </NodeResizeControl>
        {contentOf(id)}
      </div>
    </div>
  )
}
// While an icon from a taskbar is over the empty canvas: a ghost of the window a drop
// would open, as a node of its own, under the pointer. It takes no pointer, so the
// canvas under it still reads as empty.
const DropGhostNodeView = (): React.JSX.Element => (
  <div className="view-drop-preview canvas-drop-ghost" aria-hidden="true">
    <span className="view-drop-preview-header">{useDropPreview()?.label}</span>
  </div>
)

export const dropGhostId = "drop-ghost"

export const nodeTypes = { terminal: TerminalNodeView, dropGhost: DropGhostNodeView }
