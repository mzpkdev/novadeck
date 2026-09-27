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

// Holds the workspace back until its backend is reachable, since the seed comes from
// it. Shows plain text meanwhile, and the error instead if the first attempt fails.
export const BackendGate = ({
  selection,
  render,
}: {
  // Read once when the gate mounts.
  readonly selection: BackendSelection
  // The workspace, once the backend can be created.
  readonly render: (createBackend: CreateBackend) => ReactNode
}): ReactNode => {
  const [initial] = useState(selection)
  const [gate, setGate] = useState(() => initialGate(initial))
  useEffect(() => {
    if (!("connect" in initial)) return
    const controller = new AbortController()
    let connection: BackendConnection | undefined
    initial.connect(controller.signal).then(
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
  }, [initial])
  if (gate.state === "ready") return render(gate.createBackend)
  return (
    <div role="status" className="flex h-dvh items-center justify-center bg-paper">
      {gate.state === "connecting" ? "Connecting…" : gate.message}
    </div>
  )
}
