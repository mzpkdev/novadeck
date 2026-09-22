import { Plus } from "lucide-react"

import "./SessionsPanel.css"

export type WorkspaceSessionSummary = {
  id: string
  name: string
  visitedAt: number
  terminalNames: string[]
  running: number
}

type SessionsPanelProps = {
  items: WorkspaceSessionSummary[]
  activeId: string
  onSelect: (id: string) => void
  onFresh: () => void
}

const timestamp = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const formatVisited = (visitedAt: number): string => timestamp.format(new Date(visitedAt))

export const SessionsPanel = ({
  items,
  activeId,
  onSelect,
  onFresh,
}: SessionsPanelProps): React.JSX.Element => {
  return (
    <div className="sessions-panel">
      <button className="sessions-panel-fresh" type="button" onClick={onFresh}>
        <Plus size={14} strokeWidth={1.65} />
        <span>Start fresh</span>
      </button>
      <p className="sessions-panel-helper">Your other terminals keep running.</p>
      <div className="sessions-panel-list" role="list" aria-label="Saved sessions">
        {items.map((item) => {
          const active = item.id === activeId
          const terminalCount = item.terminalNames.length
          const preview = terminalCount ? item.terminalNames.join(", ") : "No terminals yet"
          const visited = formatVisited(item.visitedAt)

          return (
            <article
              key={item.id}
              className={`sessions-panel-entry${active ? " active" : ""}`}
              role="listitem"
              data-workspace-session={item.id}
            >
              <button
                className="sessions-panel-select"
                type="button"
                aria-label={`Open ${item.name}`}
                aria-description={`Last visited ${visited}`}
                aria-current={active ? "true" : undefined}
                title={`${item.name}\nLast visited ${visited}`}
                onClick={() => onSelect(item.id)}
              >
                <span className="sessions-panel-copy">
                  <span className="sessions-panel-title-row">
                    <strong>{item.name}</strong>
                    {active && <span className="sessions-panel-current">Current</span>}
                  </span>
                  <span className="sessions-panel-meta">
                    <span>
                      {terminalCount} {terminalCount === 1 ? "terminal" : "terminals"}
                    </span>
                    {item.running > 0 && (
                      <span className="sessions-panel-running">{item.running} running</span>
                    )}
                  </span>
                  <span className="sessions-panel-preview">{preview}</span>
                </span>
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
