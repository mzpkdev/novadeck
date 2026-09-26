import { useMemo, type ReactNode } from "react"

import type { TerminalMetadata } from "../../model/types"
import { backgroundPointerHandlers } from "../background"
import { useTerminalVisibility } from "../useTerminalVisibility"

export const Focus = ({
  sessions,
  displayed,
  onSelect,
  render,
}: {
  sessions: TerminalMetadata[]
  displayed: string
  onSelect: (id: string) => void
  render: (session: TerminalMetadata) => ReactNode
}): React.JSX.Element => {
  const hidden = useMemo(
    () => Object.fromEntries(sessions.map((session) => [session.id, session.id !== displayed])),
    [sessions, displayed],
  )
  const removed = useTerminalVisibility(hidden)
  return (
    <div
      data-workspace-viewport
      className="focus-stage relative min-h-0 flex-1 overflow-hidden workspace-background"
      {...backgroundPointerHandlers}
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        if ((event.target as Element).closest("[data-terminal]")) onSelect(displayed)
      }}
      onFocusCapture={(event) => {
        if ((event.target as Element).closest("[data-terminal]")) onSelect(displayed)
      }}
    >
      <div className="workspace-dots absolute inset-0 canvas-grid" aria-hidden="true" />
      <div className="workspace-dots absolute inset-0 canvas-grid-spotlight" aria-hidden="true" />
      {sessions
        .filter((session) => !removed[session.id])
        .map((session) => (
          <div
            key={session.id}
            className="terminal-visibility absolute inset-3 max-[701px]:inset-1.5 data-[hiding=false]:z-1"
            data-hiding={hidden[session.id]}
            aria-hidden={hidden[session.id]}
            inert={hidden[session.id]}
          >
            {render(session)}
          </div>
        ))}
    </div>
  )
}
