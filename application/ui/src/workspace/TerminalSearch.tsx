import { ArrowUpRight, Search, Terminal as TerminalIcon, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import type { Session } from "./types"

import "./ModalMotion.css"

export const TerminalSearch = ({
  open,
  sessions,
  destination,
  onSelect,
  onClose,
}: {
  open: boolean
  sessions: Session[]
  destination: string
  onSelect: (id: string) => void
  onClose: () => void
}): React.JSX.Element => {
  const [query, setQuery] = useState("")
  const matches = sessions.filter((session) =>
    `${session.name} ${session.directory}`.toLowerCase().includes(query.toLowerCase()),
  )
  const select = (id: string): void => {
    setQuery("")
    onSelect(id)
  }
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement as HTMLElement | null
    searchInput.current?.focus()
    return () => trigger?.focus()
  }, [open])
  return (
    <div
      className="search-backdrop fixed inset-0 z-50 flex items-start justify-center px-5 pt-[16vh] bg-scrim backdrop-blur-[3px]"
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
      inert={!open}
      onClick={() => onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Find a terminal"
        className="search-dialog w-full max-w-130 overflow-hidden rounded-popover border border-line-strong bg-paper"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>("button, input"),
            )
            const index = controls.indexOf(document.activeElement as HTMLElement)
            event.preventDefault()
            controls[
              (index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length
            ]?.focus()
          }
        }}
      >
        <div className="search-field flex min-h-17 items-center gap-3 border-b border-line px-5 py-3 text-muted">
          <Search size={18} />
          <input
            ref={searchInput}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink focus-visible:outline-none"
            aria-label="Search terminals"
            placeholder="Find a terminal…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                select(matches[0].id)
              }
            }}
          />
          <button className="icon-button" aria-label="Close search" onClick={() => onClose()}>
            <X size={16} />
          </button>
        </div>
        <div className="search-results flex max-h-[50vh] flex-col gap-1 overflow-y-auto p-2 [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent]">
          {matches.map((session) => (
            <button
              className="group flex min-h-15 w-full items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-left hover:border-line hover:bg-shell focus-visible:border-line focus-visible:bg-shell focus-visible:outline-offset-[-2px] [&>svg]:shrink-0 [&>svg]:text-muted"
              key={session.id}
              onClick={() => select(session.id)}
            >
              <TerminalIcon size={15} strokeWidth={1.5} />
              <span className="search-result-copy flex min-w-0 flex-1 flex-col gap-1">
                <strong className="truncate text-xs font-medium">{session.name}</strong>
                <small className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-muted">
                  <span className="shrink-0">{session.command}</span>
                  <span className="truncate border-l border-line pl-2">{session.directory}</span>
                </small>
              </span>
              <ArrowUpRight size={14} className="search-result-action" />
            </button>
          ))}
          {!matches.length && (
            <p className="search-empty px-4 py-10 text-center text-xs text-muted">
              No terminals match “{query}”.
            </p>
          )}
        </div>
        <div className="search-footnote flex items-center justify-between border-t border-line bg-shell px-5 py-3 text-[10px] text-muted">
          <span>Open in {destination}</span>
          <span className="search-dismiss flex items-center gap-2">
            <kbd>esc</kbd> Close
          </span>
        </div>
      </section>
    </div>
  )
}
