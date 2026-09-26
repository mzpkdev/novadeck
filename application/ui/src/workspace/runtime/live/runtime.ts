import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import { createStore, type StoreApi } from "zustand/vanilla"

import type { RuntimeConnection } from "../../../services/runtime-connection"
import { deferDeviceResponsesToRuntime } from "./device-responses"
import { applyTerminalEvent } from "./events"

export type LiveRuntimeOptions = {
  onTerminalExit?: (terminalId: string, exitCode: number | null) => void
}

export type LiveTerminalSnapshot = {
  status: "connecting" | "attached" | "disconnected" | "exited" | "error"
  control: boolean
  exitCode: number | null
  error: string | null
}
export type LiveTerminalOptions = {
  fontSize?: number
  focus?: boolean
  keyHandler?: (event: KeyboardEvent) => boolean
  onInputFocused?: () => void
}
export type LiveTerminalRuntime = {
  mount(id: string, container: HTMLElement, options?: LiveTerminalOptions): () => void
  getTerminalStore(id: string): StoreApi<LiveTerminalSnapshot>
  focus(id: string): void
  retryAttachment(id: string): void
  disposeTerminal(id: string): void
  dispose(): void
}
type Entry = {
  terminal: Terminal
  fit: FitAddon
  element: HTMLDivElement
  store: StoreApi<LiveTerminalSnapshot>
  controller: AbortController | null
  runtimeId: string | null
  cursor: number | undefined
  queue: Promise<void>
  inputQueue: Promise<void>
  generation: number
  disposed: boolean
  mount: symbol | null
  options: LiveTerminalOptions
  resize: (() => void) | null
  refit: (() => void) | null
  applying: boolean
  syncedSize: string | null
  pendingFit: boolean
  retired: boolean
  exitNotified: boolean
}
const snapshot = (): LiveTerminalSnapshot => ({
  status: "connecting",
  control: false,
  exitCode: null,
  error: null,
})
const codeOf = (error: unknown) =>
  error && typeof error === "object" && "code" in error ? error.code : null

export const createLiveTerminalRuntime = (
  connection: RuntimeConnection,
  runtimeOptions: LiveRuntimeOptions = {},
): LiveTerminalRuntime => {
  const entries = new Map<string, Entry>()
  let disposed = false
  const controlled = (entry: Entry) =>
    !entry.disposed &&
    entry.store.getState().control &&
    entry.store.getState().status === "attached" &&
    connection.store.getState().status === "connected" &&
    entry.generation === connection.store.getState().generation
  const operationFailed = (entry: Entry, error: unknown) => {
    if (entry.disposed) return
    const code = codeOf(error)
    if (code === "CONTROL_REQUIRED" || code === "TERMINAL_EXITED") {
      entry.store.setState({
        control: false,
        ...(code === "TERMINAL_EXITED" ? { status: "exited" as const } : {}),
      })
    }
    entry.store.setState({ error: "Terminal action failed. It was not retried." })
  }
  const attach = async (id: string, entry: Entry): Promise<void> => {
    entry.controller?.abort()
    if (entry.retired) return
    const state = connection.store.getState()
    if (state.status !== "connected" || entry.disposed) {
      entry.store.setState({ status: "disconnected", control: false })
      return
    }
    const controller = new AbortController()
    entry.controller = controller
    entry.generation = state.generation
    entry.syncedSize = null
    if (entry.runtimeId !== state.runtimeId) {
      entry.runtimeId = state.runtimeId
      entry.cursor = undefined
      entry.exitNotified = false
    }
    const client = connection.getClient()
    const current = () =>
      !entry.disposed &&
      !controller.signal.aborted &&
      connection.store.getState().status === "connected" &&
      state.generation === connection.store.getState().generation
    entry.store.setState({ status: "connecting", control: false, error: null })
    const consume = async (mode: "control" | "observe") => {
      const stream = await client.terminals.attach(
        {
          terminalId: id,
          mode,
          ...(entry.cursor === undefined ? {} : { afterSequence: entry.cursor }),
        },
        { signal: controller.signal },
      )
      if (!current()) return
      entry.store.setState({ status: "attached", control: mode === "control" })
      if (entry.cursor !== undefined) entry.refit?.()
      for await (const event of stream) {
        if (!current()) return
        // Keep one screen queue across generations: old writes finish before a replacement snapshot.
        const applied = entry.queue.then(async () => {
          if (!current()) return
          if (
            event.type !== "snapshot" &&
            entry.cursor !== undefined &&
            event.sequence <= entry.cursor
          )
            return
          entry.applying = true
          try {
            await applyTerminalEvent(entry.terminal, event)
          } finally {
            entry.applying = false
          }
          if (!current()) return
          entry.cursor = event.sequence
          if (event.type === "snapshot" || event.type === "exited") {
            entry.store.setState({
              status: event.type === "exited" || event.status === "exited" ? "exited" : "attached",
              exitCode: event.exitCode,
              ...(event.type === "exited" || event.status === "exited" ? { control: false } : {}),
            })
          }
          if (
            (event.type === "exited" || (event.type === "snapshot" && event.status === "exited")) &&
            !entry.exitNotified
          ) {
            entry.exitNotified = true
            try {
              runtimeOptions.onTerminalExit?.(id, event.exitCode)
            } catch {
              entry.store.setState({ error: "Could not update terminal metadata." })
            }
          }
          await client.terminals.ack(
            { terminalId: id, sequence: event.sequence },
            { signal: controller.signal },
          )
          if (event.type === "snapshot" || entry.pendingFit) {
            entry.pendingFit = false
            entry.refit?.()
          }
        })
        entry.queue = applied.catch(() => undefined)
        // eslint-disable-next-line no-await-in-loop -- Preserve event order and ACK parsed output before taking more.
        await applied
      }
      if (current() && entry.store.getState().status !== "exited") {
        entry.store.setState({
          status: "error",
          control: false,
          error: "Terminal stream ended.",
        })
      }
    }
    try {
      try {
        await consume("control")
      } catch (error) {
        if (!current() || codeOf(error) !== "CONTROL_IN_USE") throw error
        await consume("observe")
      }
    } catch {
      if (!current()) return
      entry.store.setState({
        status: "error",
        control: false,
        error: "Could not attach to the terminal.",
      })
    }
  }
  const ensure = (id: string): Entry => {
    const existing = entries.get(id)
    if (existing) return existing
    if (disposed) throw new Error("Terminal runtime is disposed")
    const terminal = new Terminal({
      cols: 80,
      rows: 24,
      fontSize: 13,
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      cursorBlink: true,
      screenReaderMode: true,
      scrollback: 5000,
      theme: {
        background: "#ffffff",
        foreground: "#262826",
        cursor: "#373c35",
        selectionBackground: "#cdd2ca",
      },
    })
    deferDeviceResponsesToRuntime(terminal.parser)
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    const element = document.createElement("div")
    element.className = "live-terminal-screen"
    const entry: Entry = {
      terminal,
      fit,
      element,
      store: createStore(snapshot),
      controller: null,
      runtimeId: null,
      cursor: undefined,
      queue: Promise.resolve(),
      inputQueue: Promise.resolve(),
      generation: -1,
      disposed: false,
      mount: null,
      options: {},
      resize: null,
      refit: null,
      applying: false,
      syncedSize: null,
      pendingFit: false,
      retired: false,
      exitNotified: false,
    }
    entries.set(id, entry)
    terminal.attachCustomKeyEventHandler((event) => {
      if (!entry.options.keyHandler?.(event)) return true
      event.preventDefault()
      event.stopPropagation()
      return false
    })
    terminal.onData((data) => {
      if (!controlled(entry) || !data) return
      const generation = entry.generation
      const client = connection.getClient()
      entry.inputQueue = entry.inputQueue
        .then(async () => {
          for (let offset = 0; offset < data.length;) {
            if (!controlled(entry) || entry.generation !== generation) return
            let end = Math.min(offset + 16_384, data.length)
            // Keep a UTF-16 surrogate pair together at the protocol's input size boundary.
            const last = data.charCodeAt(end - 1)
            if (end < data.length && last >= 0xd800 && last <= 0xdbff) end -= 1
            const chunk = data.slice(offset, end)
            // eslint-disable-next-line no-await-in-loop -- Preserve paste/input ordering without retrying uncertain writes.
            await client.terminals.write({ terminalId: id, data: chunk })
            offset = end
          }
        })
        .catch((error: unknown) => {
          if (entry.generation === generation) operationFailed(entry, error)
        })
    })
    element.addEventListener("focusin", () => entry.options.onInputFocused?.())
    element.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
      },
      { passive: true },
    )
    return entry
  }
  const unsubscribe = connection.store.subscribe((state, previous) => {
    if (
      state.status === "connected" &&
      (previous.status !== "connected" || state.generation !== previous.generation)
    ) {
      for (const [id, entry] of entries) {
        if (entry.runtimeId && entry.runtimeId !== state.runtimeId) {
          entry.retired = true
          entry.controller?.abort()
          if (!entry.mount) disposeTerminal(id)
          else
            entry.store.setState({
              status: "error",
              control: false,
              error: "Runtime restarted. Reload the workspace to discover its terminals.",
            })
          continue
        }
        void attach(id, entry)
      }
    } else if (state.status !== "connected") {
      for (const entry of entries.values()) {
        entry.controller?.abort()
        if (entry.applying) entry.cursor = undefined
        entry.store.setState({ status: "disconnected", control: false })
      }
    }
  })
  const disposeTerminal = (id: string) => {
    const entry = entries.get(id)
    if (!entry) return
    entry.disposed = true
    entry.controller?.abort()
    entry.resize?.()
    entry.terminal.dispose()
    entry.element.remove()
    entries.delete(id)
  }
  return {
    getTerminalStore(id) {
      return ensure(id).store
    },
    mount(id, container, options = {}) {
      const entry = ensure(id)
      const identity = Symbol(id)
      entry.mount = identity
      entry.options = options
      entry.resize?.()
      container.append(entry.element)
      if (!entry.terminal.element) entry.terminal.open(entry.element)
      entry.terminal.options.fontSize = options.fontSize ?? 13
      const fit = () => {
        if (entry.mount !== identity || !entry.element.isConnected) return
        if (entry.applying) {
          entry.pendingFit = true
          return
        }
        const box = container.getBoundingClientRect()
        if (box.width < 20 || box.height < 20) return
        const dimensions = entry.fit.proposeDimensions()
        if (!dimensions) return
        const cols = Math.max(2, Math.min(dimensions.cols, 500))
        const rows = Math.max(1, Math.min(dimensions.rows, 200))
        entry.terminal.resize(cols, rows)
        const size = `${cols}:${rows}`
        if (!controlled(entry) || entry.cursor === undefined || entry.syncedSize === size) return
        entry.syncedSize = size
        const generation = entry.generation
        void connection
          .getClient()
          .terminals.resize({ terminalId: id, cols, rows })
          .catch((error: unknown) => {
            if (entry.generation === generation) operationFailed(entry, error)
          })
      }
      entry.refit = fit
      const observer = new ResizeObserver(fit)
      observer.observe(container)
      const frame = requestAnimationFrame(() => {
        fit()
        if (options.focus) entry.terminal.focus()
      })
      entry.resize = () => {
        observer.disconnect()
        cancelAnimationFrame(frame)
      }
      if (!entry.controller || entry.controller.signal.aborted) void attach(id, entry)
      return () => {
        if (entry.mount !== identity) return
        entry.resize?.()
        entry.resize = null
        entry.refit = null
        entry.mount = null
        entry.options = {}
        entry.terminal.blur()
        entry.element.remove()
        if (entry.retired) disposeTerminal(id)
      }
    },
    focus(id) {
      entries.get(id)?.terminal.focus()
    },
    retryAttachment(id) {
      const entry = entries.get(id)
      if (!entry || connection.store.getState().status !== "connected") return
      entry.cursor = undefined
      void attach(id, entry)
    },
    disposeTerminal,
    dispose() {
      disposed = true
      unsubscribe()
      for (const id of entries.keys()) disposeTerminal(id)
    },
  }
}
