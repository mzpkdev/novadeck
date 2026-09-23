import { ArrowUpRight, Search, Terminal as TerminalIcon, X } from "lucide-react"
import { useRef, useState } from "react"

import { Dialog } from "../../ui-toolkit/Dialog"
import { SearchCombobox } from "../../ui-toolkit/SearchCombobox"
import type { Session } from "../model/types"

import "../shell/ModalMotion.css"

export const TerminalSearch = ({
  open,
  sessions,
  destination,
  onSelect,
  onClose,
  onExitComplete,
}: {
  open: boolean
  sessions: Session[]
  destination: string
  onSelect: (id: string) => void
  onClose: () => void
  onExitComplete?: () => void
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
  return (
    <Dialog
      open={open}
      onOpenChange={(expanded) => {
        if (!expanded) onClose()
      }}
      label="Find a terminal"
      onExitComplete={onExitComplete}
      initialFocusEl={() => searchInput.current}
      backdropClassName="search-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-[3px]"
      positionerClassName="fixed inset-0 z-50 flex items-start justify-center px-5 pt-[16vh]"
      className="search-dialog w-full max-w-130 overflow-hidden rounded-popover border border-line-strong bg-paper shadow-modal"
    >
      <SearchCombobox
        label="Search terminals"
        placeholder="Find a terminal…"
        resultsLabel="Matching terminals"
        controlClassName="search-field"
        contentClassName="search-results"
        inputRef={searchInput}
        query={query}
        onQueryChange={setQuery}
        onSelect={select}
        leading={<Search size={18} />}
        trailing={
          <button className="icon-button" aria-label="Close search" onClick={onClose}>
            <X size={16} />
          </button>
        }
        empty={
          <p className="search-empty px-4 py-10 text-center text-xs text-muted">
            No terminals match “{query}”.
          </p>
        }
        items={matches.map((session) => ({
          value: session.id,
          label: session.name,
          content: (
            <>
              <TerminalIcon size={15} strokeWidth={1.5} />
              <span className="search-result-copy flex min-w-0 flex-1 flex-col gap-1">
                <strong className="truncate text-xs font-medium">{session.name}</strong>
                <small className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-muted">
                  <span className="shrink-0">{session.command}</span>
                  <span className="truncate border-l border-line pl-2">{session.directory}</span>
                </small>
              </span>
              <ArrowUpRight
                size={14}
                className="search-result-action opacity-25 transition-opacity duration-(--motion-feedback) ease-interface group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[highlighted]:opacity-100"
              />
            </>
          ),
        }))}
      />
      <div className="search-footnote flex items-center justify-between border-t border-line bg-shell px-5 py-3 text-[10px] text-muted">
        <span>Open in {destination}</span>
        <span className="search-dismiss flex items-center gap-2">
          <kbd>esc</kbd> Close
        </span>
      </div>
    </Dialog>
  )
}
