import { ArrowRight, Layers, Terminal } from "lucide-react"
import { useEffect, useRef } from "react"

import type { Session } from "../model/types"

export const TerminalSwitcher = ({
  sessions,
  selected,
  project,
}: {
  sessions: Session[]
  selected: string | undefined
  project: string
}): React.JSX.Element => {
  const active = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selected) return
    active.current?.scrollIntoView?.({ block: "nearest" })
  }, [selected])

  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/25 backdrop-blur-[3px]" />
      <section
        aria-label="Terminal switcher"
        className="pointer-events-auto relative flex max-h-[calc(100dvh-32px)] w-full max-w-100 flex-col overflow-hidden rounded-popover border border-line-strong bg-paper shadow-[0_24px_80px_-16px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.6)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3.5">
          <Layers size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-xs font-medium">Switch terminal</h2>
            <p className="m-0 mt-0.5 truncate text-[10px] text-muted">{project}</p>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted">
            {sessions.findIndex((session) => session.id === selected) + 1} / {sessions.length}
          </span>
        </header>
        <div
          role="listbox"
          aria-label="Recent terminals"
          className="min-h-0 overflow-y-auto p-1.5 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin]"
        >
          {sessions.map((session) => {
            const current = session.id === selected
            return (
              <div
                key={session.id}
                ref={current ? active : undefined}
                role="option"
                aria-label={session.name}
                aria-selected={current}
                className={`flex items-center gap-3 rounded-control px-3 py-2.5 ${current ? "bg-strong text-white shadow-control" : "text-ink"}`}
              >
                <Terminal size={16} className="shrink-0 opacity-65" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-xs font-medium">{session.name}</p>
                  <p
                    className={`m-0 mt-1 truncate font-mono text-[10px] ${current ? "text-white/65" : "text-muted"}`}
                  >
                    {session.process || session.command}
                  </p>
                </div>
                {current && <ArrowRight size={14} className="shrink-0" aria-hidden="true" />}
              </div>
            )
          })}
        </div>
        <footer className="shrink-0 border-t border-line bg-shell px-4 py-3 text-[10px] text-muted">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span>
              <kbd>Tab</kbd> next
            </span>
            <span>
              <kbd>Shift Tab</kbd> previous
            </span>
            <span className="ml-auto">
              <kbd>Esc</kbd> cancel
            </span>
          </div>
          <p className="m-0 mt-2">
            Release <span className="font-medium text-ink">Ctrl</span> to switch
          </p>
        </footer>
      </section>
    </div>
  )
}
