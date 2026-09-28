import { EndingBar, LockNotice, type RunnerSurfaceProps } from "./RunnerSurfaceParts"

// Codex's copy of the terminal surface can evolve without changing other cards.
export const CodexRunnerSurface = ({
  minimized,
  clipContent,
  locked,
  ending,
  notice,
  onRestart,
  onRootMount,
  onHostMount,
}: RunnerSurfaceProps): React.JSX.Element => (
  <div
    ref={onRootMount}
    data-terminal-content
    className="terminal-content runner-terminal nodrag nopan relative flex min-h-0 flex-1 flex-col p-3"
    hidden={minimized && !clipContent}
    aria-hidden={minimized}
    inert={minimized}
    data-locked={locked || undefined}
  >
    <div ref={onHostMount} className="flex min-h-0 flex-1 flex-col" />
    <EndingBar ending={ending} paused={locked} onRestart={onRestart} />
    {locked && (
      <div
        role="status"
        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas/80 transition-opacity delay-200 duration-(--motion-state) ease-interface starting:opacity-0"
      >
        <LockNotice notice={notice} />
      </div>
    )}
  </div>
)
