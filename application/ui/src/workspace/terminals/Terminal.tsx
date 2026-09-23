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

import { Tooltip } from "../../ui-toolkit/Tooltip"
import { TerminalOutput } from "../mock/TerminalOutput"
import type { Entry, Session } from "../model/types"

export type MinimizeControls = {
  minimized: boolean
  clipContent?: boolean
  onToggle: () => void
}

const headerActionClasses =
  "icon-button [&>svg]:opacity-25 [&>svg]:transition-opacity [&>svg]:duration-(--motion-feedback) [&>svg]:ease-interface hover:[&>svg]:opacity-100"

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
  onFlyTo,
  onClose,
  windowed,
  minimize,
  compact = false,
  placing = false,
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
  onFlyTo?: () => void
  windowed?: { destination: string; onOpen: () => void }
  onClose?: () => void
  minimize?: MinimizeControls
  compact?: boolean
  placing?: boolean
}): React.JSX.Element => {
  const Heading = compact ? "h2" : "h1"
  const agent = session.kind === "claude" ? "Claude" : session.kind === "codex" ? "Codex" : null
  const input = draft
  const setInput = onDraftChange
  const savedScroll = useRef(scrollOffset)
  const previousOutput = useRef({ length: entries.length, cleared })
  const output = useRef<HTMLDivElement>(null)
  const headerPress = useRef<{ x: number; y: number; time: number } | null>(null)
  const headerTap = useRef<{ x: number; y: number; time: number } | null>(null)
  const ignoreDoubleClickUntil = useRef(0)
  const toggleView = onFlyTo ?? onFocus ?? windowed?.onOpen
  useEffect(() => {
    if (!output.current || minimize?.minimized) return
    const changed =
      previousOutput.current.length !== entries.length || previousOutput.current.cleared !== cleared
    output.current.scrollTop = changed
      ? output.current.scrollHeight
      : (savedScroll.current ?? (entries.length || cleared ? output.current.scrollHeight : 0))
    previousOutput.current = { length: entries.length, cleared }
  }, [entries.length, cleared, minimize?.minimized])
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
      className={`terminal-window data-[placing=true]:border-dashed data-[placing=true]:bg-soft data-[placing=true]:border-line-strong flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-paper shadow-panel transition-[border-color] duration-(--motion-state) ease-interface ${compact ? "terminal-compact" : "terminal-focused"}`}
      aria-label={`${session.name} terminal`}
      data-terminal={session.id}
      data-placing={placing}
    >
      <div className="terminal-heading relative shrink-0">
        <header
          data-placing={placing}
          className="terminal-header data-[placing=true]:bg-soft data-[placing=true]:border-dashed flex h-12 shrink-0 touch-manipulation select-none flex-nowrap items-center justify-between gap-3 border-b border-line bg-paper px-4 text-xs whitespace-nowrap [&_svg]:shrink-0 [&_svg]:text-muted"
          onDoubleClick={(event) => {
            if (
              performance.now() < ignoreDoubleClickUntil.current ||
              (event.target as Element).closest("button")
            )
              return
            if (!toggleView) return
            event.preventDefault()
            event.stopPropagation()
            toggleView()
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") return
            if (!event.isPrimary || (event.target as Element).closest("button")) {
              headerPress.current = null
              headerTap.current = null
              return
            }
            headerPress.current = { x: event.clientX, y: event.clientY, time: event.timeStamp }
          }}
          onPointerMove={(event) => {
            const press = headerPress.current
            if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
              headerPress.current = null
              headerTap.current = null
            }
          }}
          onPointerCancel={() => {
            headerPress.current = null
            headerTap.current = null
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== "touch") return
            const press = headerPress.current
            headerPress.current = null
            if (
              !press ||
              event.timeStamp - press.time > 300 ||
              Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8
            ) {
              headerTap.current = null
              return
            }
            const previous = headerTap.current
            headerTap.current = { x: event.clientX, y: event.clientY, time: event.timeStamp }
            if (
              !toggleView ||
              !previous ||
              event.timeStamp - previous.time > 350 ||
              Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 24
            )
              return
            headerTap.current = null
            ignoreDoubleClickUntil.current = performance.now() + 500
            event.preventDefault()
            event.stopPropagation()
            toggleView()
          }}
        >
          <div
            className="terminal-title flex min-w-0 items-center gap-2.5 [&>h1]:truncate [&>h1]:font-medium [&>h2]:truncate [&>h2]:font-medium"
            title={session.name}
          >
            <TerminalIcon size={14} strokeWidth={1.5} />
            <Heading>{session.name}</Heading>
          </div>
          <span
            className={`terminal-actions shrink-0 items-center gap-1 ${placing ? "hidden" : "flex"}`}
          >
            {minimize && (
              <Tooltip content={`${minimize.minimized ? "Restore" : "Minimize"} ${session.name}`}>
                <button
                  className={`${headerActionClasses} terminal-view-action nodrag nopan`}
                  aria-label={`${minimize.minimized ? "Restore" : "Minimize"} ${session.name}`}
                  aria-expanded={!minimize.minimized}
                  onClick={(event) => {
                    event.stopPropagation()
                    minimize.onToggle()
                  }}
                >
                  {minimize.minimized ? <Plus size={12} /> : <Minus size={12} />}
                </button>
              </Tooltip>
            )}
            {onFocus && (
              <Tooltip content={`Focus ${session.name}`}>
                <button
                  className={`${headerActionClasses} terminal-view-action nodrag nopan`}
                  aria-label={`Focus ${session.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onFocus()
                  }}
                >
                  <ArrowUpRight size={12} />
                </button>
              </Tooltip>
            )}
            {windowed && (
              <Tooltip content={`Open in ${windowed.destination}`}>
                <button
                  className={`${headerActionClasses} terminal-view-action`}
                  aria-label={`Open in ${windowed.destination}`}
                  onClick={windowed.onOpen}
                >
                  <Minimize2 size={12} />
                </button>
              </Tooltip>
            )}
            {onClose && (
              <Tooltip content={`Close ${session.name}`}>
                <button
                  className={`${headerActionClasses} terminal-close nodrag nopan`}
                  aria-label={`Close ${session.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose()
                  }}
                >
                  <X size={12} />
                </button>
              </Tooltip>
            )}
          </span>
        </header>
      </div>
      <div
        ref={output}
        className="terminal-content min-h-0 flex-1 overflow-auto p-6 font-mono text-[length:var(--terminal-font-size,13px)] leading-[1.75] [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent] [&_strong]:font-semibold nodrag nopan"
        hidden={minimize?.minimized && !minimize.clipContent}
        aria-hidden={minimize?.minimized}
        inert={minimize?.minimized}
        onScroll={(event) => {
          if (minimize?.minimized) return
          savedScroll.current = event.currentTarget.scrollTop
          onScrollChange(event.currentTarget.scrollTop)
        }}
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
