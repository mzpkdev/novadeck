import { X } from "lucide-react"
import type { ReactNode } from "react"

// What a mark says, as an OS taskbar's does: new since the user last looked, showing in
// the pane now, or seen.
export type Indicator = "new" | "open" | "seen"

export type PeekEntry = {
  readonly id: string
  readonly name: string
  readonly icon: ReactNode
  readonly preview: ReactNode
  readonly state: Indicator
  readonly onOpen: () => void
  // Absent for what can't be closed from here, such as another terminal's item.
  readonly onClose?: () => void
}

// A peek above a taskbar icon: a card for each thing behind it, one or many. The card
// says it all without words: its preview, its name, the same mark as the taskbar, and a
// close button that shows on hover.
export const Peek = ({ entries }: { entries: readonly PeekEntry[] }): React.JSX.Element => (
  <div
    className="plan-peek"
    // Escape here closes the peek, not whatever the workspace would do with it.
    data-workspace-companion
    style={{ "--peek-columns": Math.min(entries.length, 3) } as React.CSSProperties}
  >
    {entries.map((entry) => (
      <div key={entry.id} className="plan-peek-card">
        <button
          className="plan-peek-open"
          data-state={entry.state}
          aria-label={`${entry.name}${entry.state === "new" ? ", new" : ""}`}
          aria-pressed={entry.state === "open"}
          onClick={entry.onOpen}
        >
          <span className="plan-peek-thumb" aria-hidden="true">
            {entry.preview}
          </span>
          <span className="plan-peek-name">
            {entry.icon}
            <span>{entry.name}</span>
          </span>
        </button>
        {entry.onClose && (
          <button
            className="plan-peek-close"
            aria-label={`Close ${entry.name}`}
            onClick={entry.onClose}
          >
            <X size={12} />
          </button>
        )}
      </div>
    ))}
  </div>
)
