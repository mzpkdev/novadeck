import { runnerPortMessage, type DesktopBridge } from "./bridge.js"
import { RunnerError } from "./errors.js"
import type { Transport } from "./runner.js"
import { messagePort } from "./transports.js"
import type { MessagePortLike } from "./wire.js"

const request = (signal: AbortSignal) =>
  new Promise<MessagePortLike>((resolve, reject) => {
    const host = (globalThis as { novadeck?: Partial<DesktopBridge> }).novadeck
    if (!host?.requestRunner) {
      reject(new RunnerError("CLOSED", "No desktop host provides a runner."))
      return
    }
    const id = crypto.randomUUID()
    const receive = (event: MessageEvent) => {
      const data: unknown = event.data
      const port = event.ports[0]
      if (event.source !== window || !port) return
      if (typeof data !== "object" || data === null) return
      if (!("type" in data && data.type === runnerPortMessage && "id" in data && data.id === id)) {
        return
      }
      settle()
      resolve(port)
    }
    const abort = () => {
      settle()
      reject(signal.reason)
    }
    const settle = () => {
      removeEventListener("message", receive)
      signal.removeEventListener("abort", abort)
    }
    addEventListener("message", receive)
    signal.addEventListener("abort", abort, { once: true })
    host.requestRunner(id)
  })

/**
 * Reaches the runner bundled with the NovaDeck desktop app. Each connection asks the
 * host for a fresh port, so reconnecting also works after the host restarts its runner.
 */
export const desktop = (): Transport => messagePort(request)
