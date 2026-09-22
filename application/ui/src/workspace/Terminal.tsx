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

import { AgentOutput } from "./AgentOutput"
import type { Session } from "./sessions"

export type Entry = { id: string; command: string; reply: string }

const Output = ({
  kind,
  directory,
  projectName,
}: {
  kind: Session["kind"]
  directory: string
  projectName: string
}): React.JSX.Element => {
  if (kind === "claude" || kind === "codex")
    return <AgentOutput agent={kind} directory={directory} />
  if (kind === "shell")
    return (
      <>
        <div className="terminal-meta">
          <span>Last login</span>
          <span>Tue Sep 22, 09:41:08 on ttys001</span>
          <span>Workspace</span>
          <span>{directory}</span>
        </div>
        <p className="output-gap">
          <span className="prompt-arrow">❯</span> git status
        </p>
        <p>
          On branch <strong>main</strong>
        </p>
        <p className="text-muted">Your branch is up to date with 'origin/main'.</p>
        <p className="output-gap">Nothing to commit, working tree clean.</p>
        <p className="output-gap">
          <span className="prompt-arrow">❯</span> ls
        </p>
        <p className="file-list">
          <span>application/</span>
          <span>package.json</span>
          <span>README.md</span>
          <span>node_modules/</span>
          <span>pnpm-lock.yaml</span>
          <span>tsconfig.json</span>
        </p>
      </>
    )
  if (kind === "server")
    return (
      <>
        <p>
          <span className="prompt-arrow">❯</span> pnpm dev
        </p>
        <p className="text-muted">
          {">"} @{projectName}/ui dev
        </p>
        <p className="text-muted">{">"} vite</p>
        <p className="output-gap">
          <strong>VITE</strong> v7.3.6 <span className="text-muted">ready in</span> 184 ms
        </p>
        <p className="output-gap">
          Local: <span className="underline underline-offset-4">http://localhost:5173/</span>
        </p>
        <p className="text-muted">Network: use --host to expose</p>
        <p className="output-gap text-muted">09:42:16 [vite] hmr update /src/App.tsx</p>
        <p className="text-muted">09:42:18 [vite] hmr update /src/styles.css</p>
      </>
    )
  if (kind === "tests")
    return (
      <>
        <p>
          <span className="prompt-arrow">❯</span> pnpm test --watch
        </p>
        <p className="output-gap">
          <strong>DEV</strong> v5.0.1{" "}
          <span className="text-muted">{directory.replace("~", "")}</span>
        </p>
        <div className="output-gap">
          <p>
            ✓ workspace.spec.ts <span className="text-muted">(8 tests) 24ms</span>
          </p>
          <p>
            ✓ terminal.spec.ts <span className="text-muted">(6 tests) 18ms</span>
          </p>
          <p>
            ✓ canvas.spec.ts <span className="text-muted">(4 tests) 12ms</span>
          </p>
        </div>
        <div className="test-summary">
          <p>
            Test Files <strong>3 passed</strong> (3)
          </p>
          <p>
            {" "}
            Tests <strong>18 passed</strong> (18)
          </p>
          <p> Duration 684ms</p>
        </div>
        <p className="output-gap">
          <span className="terminal-badge">PASS</span> Waiting for file changes…
        </p>
        <p className="text-muted">press h to show help, press q to quit</p>
      </>
    )
  if (kind === "git")
    return (
      <>
        <p>
          <span className="prompt-arrow">❯</span> git log --oneline -5
        </p>
        <div className="output-gap git-log">
          <p>
            <span>e9a4c21</span> refine workspace layout
          </p>
          <p>
            <span>82b6f09</span> add terminal sessions
          </p>
          <p>
            <span>7d1a308</span> simplify navigation
          </p>
          <p>
            <span>c4f8e62</span> set up design tokens
          </p>
          <p>
            <span>3a9b715</span> initial commit
          </p>
        </div>
        <p className="output-gap">
          <span className="prompt-arrow">❯</span> git status --short
        </p>
        <p className="text-muted">Working tree clean.</p>
      </>
    )
  if (kind === "logs")
    return (
      <>
        <p>
          <span className="prompt-arrow">❯</span> pnpm dev
        </p>
        <p className="output-gap">Runtime listening on :3000</p>
        <p className="text-muted">Watching for changes…</p>
        <div className="output-gap request-log">
          <p>
            <span>09:41:02</span> GET /api/health <b>200</b> 2ms
          </p>
          <p>
            <span>09:41:04</span> GET /api/sessions <b>200</b> 4ms
          </p>
          <p>
            <span>09:41:04</span> WS /terminal <b>101</b> 1ms
          </p>
          <p>
            <span>09:42:10</span> GET /api/health <b>200</b> 1ms
          </p>
          <p>
            <span>09:42:16</span> GET /api/sessions <b>200</b> 3ms
          </p>
        </div>
        <p className="output-gap text-muted">Connection established. Listening.</p>
      </>
    )
  return (
    <>
      <p>
        <span className="prompt-arrow">❯</span> pnpm build
      </p>
      <p className="output-gap text-muted">vite v7.3.6 building for production…</p>
      <p>✓ 1,428 modules transformed.</p>
      <div className="output-gap">
        <p>
          dist/index.html <span className="text-muted">0.64 kB</span>
        </p>
        <p>
          dist/assets/index.css <span className="text-muted">12.81 kB</span>
        </p>
        <p>
          dist/assets/index.js <span className="text-muted">184.32 kB</span>
        </p>
      </div>
      <p className="output-gap">✓ built in 1.24s</p>
    </>
  )
}

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
      className={`terminal-window ${compact ? "terminal-compact" : "terminal-focused"}`}
      aria-label={`${session.name} terminal`}
      data-terminal={session.id}
    >
      <div className="terminal-heading">
        <header className="terminal-header">
          <div className="terminal-title" title={session.name}>
            <TerminalIcon size={14} strokeWidth={1.5} />
            <Heading>{session.name}</Heading>
          </div>
          <span className="terminal-actions">
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
        className="terminal-content nodrag nopan"
        hidden={minimize?.minimized}
        onScroll={(event) => onScrollChange(event.currentTarget.scrollTop)}
      >
        {!cleared && (
          <Output kind={session.kind} directory={session.directory} projectName={projectName} />
        )}
        {entries.map((entry) => (
          <div className="output-gap" key={entry.id}>
            <p>
              <span className="prompt-arrow">❯</span> {entry.command}
            </p>
            <p className="whitespace-pre-wrap text-muted">{entry.reply}</p>
          </div>
        ))}
        <form
          className={`command-form${agent ? " agent-command-form" : ""}`}
          onSubmit={(event) => {
            event.preventDefault()
            if (input.trim()) {
              onCommand(input)
              setInput("")
            }
          }}
        >
          {!agent && (
            <div className="command-location">
              <span>{projectName}</span>
              <GitBranch size={12} />
              <span className="text-muted">main</span>
            </div>
          )}
          <label className="command-line">
            <span className="prompt-arrow">❯</span>
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
