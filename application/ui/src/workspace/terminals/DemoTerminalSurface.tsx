import { GitBranch } from "lucide-react"
import { useEffect, useRef } from "react"

import { TerminalOutput } from "../mock/TerminalOutput"
import type { TerminalProps } from "./Terminal"

export type DemoTerminalSurfaceProps = Pick<
  TerminalProps,
  | "session"
  | "projectName"
  | "entries"
  | "cleared"
  | "onCommand"
  | "draft"
  | "onDraftChange"
  | "scrollOffset"
  | "onScrollChange"
  | "focusInput"
  | "onInputFocused"
  | "minimize"
>

export const DemoTerminalSurface = ({
  session,
  projectName,
  entries,
  cleared,
  onCommand,
  draft,
  onDraftChange,
  scrollOffset,
  onScrollChange,
  focusInput,
  onInputFocused,
  minimize,
}: DemoTerminalSurfaceProps): React.JSX.Element => {
  const agent = session.kind === "claude" ? "Claude" : session.kind === "codex" ? "Codex" : null
  const input = draft
  const setInput = onDraftChange
  const savedScroll = useRef(scrollOffset)
  const previousOutput = useRef({ length: entries.length, cleared })
  const output = useRef<HTMLDivElement>(null)
  const commandInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focusInput || !commandInput.current) return
    commandInput.current.focus({ preventScroll: true })
    onInputFocused?.()
  }, [focusInput, onInputFocused])
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
    <div
      ref={output}
      data-terminal-content
      className="terminal-content min-h-0 flex-1 overflow-auto p-6 font-mono text-[length:var(--terminal-font-size,13px)] leading-[1.75] [&_strong]:font-semibold nodrag nopan"
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
            ref={commandInput}
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
  )
}
