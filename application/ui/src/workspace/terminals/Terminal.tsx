import {
  Minimize2,
  ArrowUpRight,
  GitBranch,
  Minus,
  Plus,
  Terminal as TerminalIcon,
  X,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { TerminalOutput } from "../mock/TerminalOutput"
import type { Entry, Session } from "../model/types"

export type MinimizeControls = {
  minimized: boolean
  onToggle: () => void
}

export const Terminal = ({
  session,
  projectName,
  entries,
  cleared,
  onCommand,
  draft,
  onDraftChange,
  scrollOffset,
  onScrollChange,
  onFocus,
  onClose,
  windowed,
  minimize,
  compact = false,
}: {
  session: Session
  projectName: string
  entries: Entry[]
  cleared: boolean
  onCommand: (command: string) => void
  draft: string
  onDraftChange: (draft: string) => void
  scrollOffset: number | undefined
  onScrollChange: (offset: number) => void
  onFocus?: () => void
  windowed?: { destination: string; onOpen: () => void }
  onClose?: () => void
  minimize?: MinimizeControls
  compact?: boolean
}): React.JSX.Element => {
  const Heading = compact ? "h2" : "h1"
  const agent = session.kind === "claude" ? "Claude" : session.kind === "codex" ? "Codex" : null
  const input = draft
  const setInput = onDraftChange
  const initialScroll = useRef(scrollOffset)
  const previousOutput = useRef({ length: entries.length, cleared })
  const output = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!output.current) return
    const changed =
      previousOutput.current.length !== entries.length || previousOutput.current.cleared !== cleared
    output.current.scrollTop = changed
      ? output.current.scrollHeight
      : (initialScroll.current ?? (entries.length || cleared ? output.current.scrollHeight : 0))
    previousOutput.current = { length: entries.length, cleared }
  }, [entries.length, cleared])
  useEffect(() => {
    const element = output.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      // Intercept before XYFlow's native listener, but let zoom gestures reach it.
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
    }
    element.addEventListener("wheel", onWheel, { passive: true })
    return () => element.removeEventListener("wheel", onWheel)
  }, [])
  return (
    <section
      className={`terminal-window flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-paper shadow-panel transition-[border-color] duration-(--motion-state) ease-interface ${compact ? "terminal-compact" : "terminal-focused"}`}
      aria-label={`${session.name} terminal`}
      data-terminal={session.id}
    >
      <div className="terminal-heading relative shrink-0">
        <header className="terminal-header flex h-12 shrink-0 flex-nowrap items-center justify-between gap-3 border-b border-line bg-paper px-4 text-xs whitespace-nowrap [&_svg]:shrink-0 [&_svg]:text-muted">
          <div
            className="terminal-title flex min-w-0 items-center gap-2.5 [&>h1]:truncate [&>h1]:font-medium [&>h2]:truncate [&>h2]:font-medium"
            title={session.name}
          >
            <TerminalIcon size={14} strokeWidth={1.5} />
            <Heading>{session.name}</Heading>
          </div>
          <span className="terminal-actions flex shrink-0 items-center gap-1">
            {minimize && (
              <button
                className="icon-button terminal-view-action nodrag nopan"
                title={`${minimize.minimized ? "Restore" : "Minimize"} ${session.name}`}
                aria-label={`${minimize.minimized ? "Restore" : "Minimize"} ${session.name}`}
                aria-expanded={!minimize.minimized}
                onClick={(event) => {
                  event.stopPropagation()
                  minimize.onToggle()
                }}
              >
                {minimize.minimized ? <Plus size={12} /> : <Minus size={12} />}
              </button>
            )}
            {onFocus && (
              <button
                className="icon-button terminal-view-action nodrag nopan"
                title={`Focus ${session.name}`}
                aria-label={`Focus ${session.name}`}
                onClick={onFocus}
              >
                <ArrowUpRight size={12} />
              </button>
            )}
            {windowed && (
              <button
                className="icon-button terminal-view-action"
                title={`Open in ${windowed.destination}`}
                aria-label={`Open in ${windowed.destination}`}
                onClick={windowed.onOpen}
              >
                <Minimize2 size={12} />
              </button>
            )}
            {onClose && (
              <button
                className="icon-button terminal-close nodrag nopan"
                title={`Close ${session.name}`}
                aria-label={`Close ${session.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose()
                }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        </header>
      </div>
      <div
        ref={output}
        className="terminal-content min-h-0 flex-1 overflow-auto p-6 font-mono text-[length:var(--terminal-font-size,13px)] leading-[1.75] [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent] [&_strong]:font-semibold nodrag nopan"
        hidden={minimize?.minimized}
        onScroll={(event) => onScrollChange(event.currentTarget.scrollTop)}
      >
        {!cleared && (
          <TerminalOutput
            kind={session.kind}
            directory={session.directory}
            projectName={projectName}
          />
        )}
        {entries.map((entry) => (
          <div className="output-gap" key={entry.id}>
            <p>
              <span className="prompt-arrow mr-2 font-semibold">❯</span> {entry.command}
            </p>
            <p className="whitespace-pre-wrap text-muted">{entry.reply}</p>
          </div>
        ))}
        <form
          className={`command-form mt-6 rounded-control border border-line bg-shell p-3 transition-[border-color] duration-(--motion-state) ease-interface focus-within:border-line-strong${agent ? " agent-command-form max-w-180 [&_input]:placeholder:text-muted" : ""}`}
          onSubmit={(event) => {
            event.preventDefault()
            if (input.trim()) {
              onCommand(input)
              setInput("")
            }
          }}
        >
          {!agent && (
            <div className="command-location mb-1 flex items-center gap-2 text-[10px] text-muted [&>svg]:ml-1 [&>svg]:text-muted">
              <span>{projectName}</span>
              <GitBranch size={12} />
              <span className="text-muted">main</span>
            </div>
          )}
          <label className="command-line flex items-center border-b border-transparent transition-[border-color] duration-(--motion-state) ease-interface focus-within:border-b-line [&_input]:w-full [&_input]:flex-1 [&_input]:bg-transparent [&_input]:caret-ink [&_input:focus-visible]:outline-none">
            <span className="prompt-arrow mr-2 font-semibold">❯</span>
            <input
              aria-label={`Command for ${session.name}`}
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={agent ? `Message ${agent}…` : ""}
            />
          </label>
        </form>
      </div>
    </section>
  )
}
