import { protocolVersion, type RuntimeClient } from "@novadeck/protocol"
import { createRuntimeClient } from "@novadeck/protocol/client"
import { createStore, type StoreApi } from "zustand/vanilla"

export type ConnectionSnapshot = {
  status: "disconnected" | "connecting" | "connected" | "reconnecting" | "error"
  runtimeId: string | null
  error: string | null
  generation: number
}
export type RuntimeConnection = {
  store: StoreApi<ConnectionSnapshot>
  getClient(): RuntimeClient
  connect(options: { url: string; token: string }): Promise<void>
  disconnect(): void
  dispose(): void
}

const initial: ConnectionSnapshot = {
  status: "disconnected",
  runtimeId: null,
  error: null,
  generation: 0,
}

export const createRuntimeConnection = (): RuntimeConnection => {
  const store = createStore<ConnectionSnapshot>(() => initial)
  let socket: WebSocket | null = null
  let client: RuntimeClient | null = null
  let credentials: { url: string; token: string } | null = null
  let attempt = 0
  let retries = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const stop = () => {
    attempt += 1
    clearTimeout(timer)
    timer = undefined
    client = null
    socket?.close()
    socket = null
  }
  const open = async (reconnecting: boolean): Promise<void> => {
    if (!credentials || disposed) return
    const identity = ++attempt
    store.setState({ status: reconnecting ? "reconnecting" : "connecting", error: null })
    const candidate = new WebSocket(credentials.url)
    candidate.binaryType = "arraybuffer"
    socket = candidate
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let authenticated = false
    candidate.addEventListener(
      "close",
      () => {
        controller.abort()
        if (identity !== attempt || !authenticated || disposed || !credentials) return
        client = null
        store.setState({ status: "reconnecting" })
        timer = setTimeout(() => {
          void open(true).catch(() => undefined)
        }, 1_000)
      },
      { once: true },
    )
    try {
      const candidateClient = createRuntimeClient(candidate)
      const info = await candidateClient.runtime.handshake(
        { protocolVersion, token: credentials.token },
        { signal: controller.signal },
      )
      if (identity !== attempt || disposed) throw new Error("Connection superseded")
      authenticated = true
      retries = 0
      client = candidateClient
      store.setState({
        status: "connected",
        runtimeId: info.runtimeId,
        error: null,
        generation: store.getState().generation + 1,
      })
    } catch (error) {
      if (identity !== attempt || disposed) {
        // eslint-disable-next-line preserve-caught-error -- Never expose transport/authentication details to UI errors.
        throw new Error("Connection superseded")
      }
      candidate.close()
      client = null
      const code = error && typeof error === "object" && "code" in error ? error.code : null
      const denied = code === "UNAUTHORIZED" || code === "INCOMPATIBLE_PROTOCOL"
      if (reconnecting && !denied && ++retries < 5) {
        store.setState({ status: "reconnecting", error: "Runtime unavailable. Reconnecting…" })
        timer = setTimeout(() => {
          void open(true).catch(() => undefined)
        }, 1_000)
      } else {
        store.setState({
          status: "error",
          error: denied
            ? "Runtime authentication or protocol compatibility failed."
            : "Could not connect to the runtime.",
        })
      }
      // eslint-disable-next-line preserve-caught-error -- Transport errors may include credentials; expose only safe text.
      throw new Error(store.getState().error ?? "Runtime connection interrupted")
    } finally {
      clearTimeout(timeout)
    }
  }
  const disconnect = () => {
    credentials = null
    stop()
    store.setState({ ...initial, generation: store.getState().generation })
  }
  return {
    store,
    getClient() {
      if (!client || store.getState().status !== "connected")
        throw new Error("Runtime is disconnected")
      return client
    },
    async connect(options) {
      if (disposed) throw new Error("Runtime connection is disposed")
      const url = new URL(options.url)
      if (
        !["ws:", "wss:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("Use a ws/wss runtime endpoint without credentials or query parameters")
      if (!options.token) throw new Error("A runtime token is required")
      stop()
      credentials = { url: url.href, token: options.token }
      retries = 0
      await open(false)
    },
    disconnect,
    dispose() {
      disposed = true
      disconnect()
    },
  }
}
