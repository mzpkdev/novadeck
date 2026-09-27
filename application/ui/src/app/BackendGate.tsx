import { Terminal as TerminalIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import type { BackendConnection, BackendSelection, CreateBackend } from "../backend/port"

type Gate =
  | { readonly state: "connecting" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "ready"; readonly createBackend: CreateBackend }

const initialGate = (selection: BackendSelection): Gate =>
  "createBackend" in selection
    ? { state: "ready", createBackend: selection.createBackend }
    : { state: "connecting" }

const Brand = (): React.JSX.Element => (
  <span className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.6px] text-ink">
    <span className="flex size-7 items-center justify-center rounded-control border border-strong bg-strong text-white">
      <TerminalIcon size={18} strokeWidth={2} aria-hidden="true" />
    </span>
    <span>
      novadeck<span className="text-muted">.</span>
    </span>
  </span>
)

type GateProps = {
  // Read once when the gate mounts.
  readonly selection: BackendSelection
  // The workspace, once the backend can be created.
  readonly render: (createBackend: CreateBackend) => ReactNode
}

// One attempt to reach the backend; it keeps the connection while it stays mounted.
const Attempt = ({
  selection,
  render,
  onRetry,
}: GateProps & { readonly onRetry: () => void }): ReactNode => {
  const [gate, setGate] = useState(() => initialGate(selection))
  useEffect(() => {
    if (!("connect" in selection)) return
    const controller = new AbortController()
    let connection: BackendConnection | undefined
    selection.connect(controller.signal).then(
      (connected) => {
        if (controller.signal.aborted) return connected.close()
        connection = connected
        setGate({ state: "ready", createBackend: connected.createBackend })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setGate({
          state: "failed",
          message: error instanceof Error ? error.message : String(error),
        })
      },
    )
    return () => {
      controller.abort()
      connection?.close()
    }
  }, [selection])
  if (gate.state === "ready") return render(gate.createBackend)
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 bg-paper px-4">
      <Brand />
      {gate.state === "connecting" ? (
        <p role="status" className="text-[12px] text-muted">
          Starting your terminals…
        </p>
      ) : (
        <section
          role="alert"
          aria-labelledby="backend-gate-title"
          className="flex w-full max-w-90 flex-col gap-3 rounded-panel border border-line bg-shell p-5 shadow-panel"
        >
          <h1 id="backend-gate-title" className="m-0 text-[13px] font-medium text-ink">
            Couldn’t connect to the runner
          </h1>
          <p className="m-0 text-[12px] leading-[1.5] text-muted">{gate.message}</p>
          <button
            type="button"
            className="self-start rounded-control border border-line-strong bg-paper px-3 py-1.5 text-[12px] text-ink shadow-control transition-[background] duration-(--motion-feedback) hover:bg-soft"
            onClick={onRetry}
          >
            Retry
          </button>
        </section>
      )}
    </main>
  )
}

// Holds the workspace back until its backend is reachable, since the seed comes from
// it. Shows a splash meanwhile, and what failed with a retry if the attempt fails.
export const BackendGate = ({ selection, render }: GateProps): ReactNode => {
  const [initial] = useState(selection)
  // Each retry is a fresh attempt; on desktop it also asks the host for a new runner.
  const [attempt, setAttempt] = useState(0)
  return (
    <Attempt
      key={attempt}
      selection={initial}
      render={render}
      onRetry={() => setAttempt((count) => count + 1)}
    />
  )
}
