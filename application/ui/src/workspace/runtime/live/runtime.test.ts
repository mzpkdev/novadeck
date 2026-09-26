import type { RuntimeClient, TerminalEvent } from "@novadeck/protocol"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"

import type { ConnectionSnapshot, RuntimeConnection } from "../../../services/runtime-connection"
import { createLiveTerminalRuntime, type LiveRuntimeOptions } from "./runtime"

const screens = vi.hoisted(
  () =>
    [] as Array<{
      writes: Array<{ data: string; parsed: () => void }>
      emit: (data: string) => void
      key: (event: KeyboardEvent) => boolean
      reset: ReturnType<typeof vi.fn>
      dispose: ReturnType<typeof vi.fn>
    }>,
)
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    element: HTMLElement | undefined
    options = { fontSize: 13 }
    parser = {
      registerCsiHandler: () => ({ dispose() {} }),
      registerDcsHandler: () => ({ dispose() {} }),
    }
    reset = vi.fn<() => void>()
    dispose = vi.fn<() => void>()
    writes: Array<{ data: string; parsed: () => void }> = []
    emit = (_data: string) => {}
    onData = (listener: (data: string) => void) => {
      this.emit = listener
    }
    key = (_event: KeyboardEvent) => true
    constructor() {
      screens.push(this)
    }
    write(data: string, parsed: () => void) {
      this.writes.push({ data, parsed })
    }
    loadAddon() {}
    resize() {}
    onResize() {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      this.key = handler
    }
    open(element: HTMLElement) {
      this.element = element
    }
    focus() {}
    blur() {}
  },
}))
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    proposeDimensions() {
      return { cols: 80, rows: 24 }
    }
  },
}))

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const runtimeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const fixture = (runtimeOptions: LiveRuntimeOptions = {}) => {
  let push: ((event: TerminalEvent) => void) | undefined
  const attach = vi.fn<
    (
      input: unknown,
      options: { signal: AbortSignal },
    ) => Promise<AsyncIterableIterator<TerminalEvent>>
  >(async (_input: unknown, options: { signal: AbortSignal }) => {
    const buffered: TerminalEvent[] = []
    let pending: ((event: IteratorResult<TerminalEvent>) => void) | undefined
    options.signal.addEventListener("abort", () => {
      pending?.({ value: undefined, done: true })
    })
    push = (event) => {
      if (pending) {
        const deliver = pending
        pending = undefined
        deliver({ value: event, done: false })
      } else buffered.push(event)
    }
    const stream: AsyncIterableIterator<TerminalEvent> = {
      [Symbol.asyncIterator]() {
        return stream
      },
      next: () =>
        options.signal.aborted
          ? Promise.resolve({ value: undefined, done: true as const })
          : buffered.length
            ? Promise.resolve({ value: buffered.shift()!, done: false as const })
            : new Promise<IteratorResult<TerminalEvent>>((resolve) => {
                pending = resolve
              }),
      return: async () => ({ value: undefined, done: true as const }),
    }
    return stream
  })
  const ack = vi.fn<RuntimeClient["terminals"]["ack"]>(async () => {})
  const write = vi.fn<RuntimeClient["terminals"]["write"]>(async () => {})
  const close = vi.fn<RuntimeClient["terminals"]["close"]>(async () => {})
  const resize = vi.fn<RuntimeClient["terminals"]["resize"]>(async () => {})
  const client = { terminals: { attach, ack, write, resize, close } } as unknown as RuntimeClient
  const store = createStore<ConnectionSnapshot>(() => ({
    status: "connected",
    runtimeId,
    error: null,
    generation: 1,
  }))
  const connection: RuntimeConnection = {
    store,
    getClient: () => client,
    connect: async () => {},
    disconnect: () => {},
    dispose: () => {},
  }
  const runtime = createLiveTerminalRuntime(connection, runtimeOptions)
  const container = document.createElement("div")
  document.body.append(container)
  return {
    runtime,
    container,
    store,
    attach,
    ack,
    write,
    close,
    resize,
    push: (event: TerminalEvent) => push?.(event),
  }
}
const flush = async () => {
  for (let index = 0; index < 10; index++) {
    // eslint-disable-next-line no-await-in-loop -- Drain consecutive renderer/iterator microtasks without polling.
    await Promise.resolve()
  }
}
afterEach(() => {
  screens.length = 0
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
const mount = (f: ReturnType<typeof fixture>) => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  return f.runtime.mount(id, f.container)
}
describe("persistent live terminal runtime", () => {
  it("keeps its screen and attachment when presentation moves, and ACKs parsed output", async () => {
    const f = fixture()
    const unmount = mount(f)
    await flush()
    f.push({ terminalId: id, sequence: 1, type: "output", data: "retained output" })
    await flush()
    expect(screens[0]!.writes[0]!.data).toBe("retained output")
    expect(f.ack).not.toHaveBeenCalled()
    screens[0]!.writes[0]!.parsed()
    await flush()
    expect(f.ack).toHaveBeenCalledWith({ terminalId: id, sequence: 1 }, expect.anything())
    unmount()
    mount(f)
    await flush()
    expect(screens).toHaveLength(1)
    expect(f.attach).toHaveBeenCalledTimes(1)
    expect(f.close).not.toHaveBeenCalled()
    f.runtime.dispose()
  })
  it("does not acknowledge old generation writes and resets cursors after a runtime restart", async () => {
    const f = fixture()
    const unmount = mount(f)
    await flush()
    f.push({ terminalId: id, sequence: 8, type: "output", data: "already processed" })
    await flush()
    screens[0]!.writes[0]!.parsed()
    await flush()
    f.ack.mockClear()
    f.push({ terminalId: id, sequence: 9, type: "output", data: "in flight" })
    await flush()
    f.store.setState({ status: "reconnecting" })
    f.store.setState({ status: "connected", generation: 2 })
    await flush()
    screens[0]!.writes[1]!.parsed()
    await flush()
    expect(f.ack).not.toHaveBeenCalled()
    expect(f.attach.mock.calls[1]![0]).not.toHaveProperty("afterSequence")
    f.push({
      terminalId: id,
      sequence: 10,
      type: "snapshot",
      data: "new snapshot",
      cols: 80,
      rows: 24,
      status: "running",
      exitCode: null,
    })
    await flush()
    screens[0]!.writes.at(-1)!.parsed()
    await flush()
    expect(f.ack).toHaveBeenCalledWith({ terminalId: id, sequence: 10 }, expect.anything())
    f.store.setState({ status: "reconnecting" })
    f.store.setState({
      status: "connected",
      generation: 3,
      runtimeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    })
    await flush()
    expect(f.attach).toHaveBeenCalledTimes(2)
    expect(f.runtime.getTerminalStore(id).getState().error).toContain("Runtime restarted")
    unmount()
    expect(screens[0]!.dispose).toHaveBeenCalledTimes(1)
    mount(f)
    await flush()
    expect(screens).toHaveLength(2)
    expect(f.attach.mock.calls.at(-1)![0]).not.toHaveProperty("afterSequence")
    f.runtime.dispose()
  })
  it("resumes a processed cursor on the same runtime, and never retries uncertain input", async () => {
    const f = fixture()
    mount(f)
    await flush()
    f.push({ terminalId: id, sequence: 3, type: "output", data: "processed" })
    await flush()
    screens[0]!.writes[0]!.parsed()
    await flush()
    f.write.mockRejectedValueOnce(new Error("Disconnected during delivery"))
    screens[0]!.emit("shell command\r")
    await flush()
    expect(f.write).toHaveBeenCalledTimes(1)
    expect(f.runtime.getTerminalStore(id).getState().error).toContain("not retried")
    f.store.setState({ status: "reconnecting" })
    screens[0]!.emit("offline input")
    await flush()
    expect(f.write).toHaveBeenCalledTimes(1)
    f.store.setState({ status: "connected", generation: 2 })
    await flush()
    expect(f.attach.mock.calls[1]![0]).toMatchObject({ afterSequence: 3 })
    expect(f.close).not.toHaveBeenCalled()
    f.runtime.dispose()
  })
  it("reattaches from a snapshot without closing the shell or replaying input", async () => {
    const f = fixture()
    mount(f)
    await flush()
    f.push({ terminalId: id, sequence: 3, type: "output", data: "processed" })
    await flush()
    screens[0]!.writes[0]!.parsed()
    await flush()
    f.runtime.retryAttachment(id)
    await flush()
    expect(f.attach).toHaveBeenCalledTimes(2)
    expect(f.attach.mock.calls[1]![0]).not.toHaveProperty("afterSequence")
    expect(f.close).not.toHaveBeenCalled()
    expect(f.write).not.toHaveBeenCalled()
    f.runtime.dispose()
  })
  it("resizes a controlled visible terminal and ignores hidden or detached geometry", async () => {
    const f = fixture()
    const callbacks: Array<() => void> = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          callbacks.push(callback)
        }
        observe() {}
        disconnect() {}
      },
    )
    const unmount = f.runtime.mount(id, f.container)
    await flush()
    f.push({ terminalId: id, sequence: 3, type: "output", data: "processed" })
    await flush()
    screens[0]!.writes[0]!.parsed()
    await flush()
    callbacks[0]!()
    expect(f.resize).not.toHaveBeenCalled()
    f.container.getBoundingClientRect = () => new DOMRect(0, 0, 550, 350)
    callbacks[0]!()
    expect(f.resize).toHaveBeenCalledWith({ terminalId: id, cols: 80, rows: 24 })
    unmount()
    callbacks[0]!()
    expect(f.resize).toHaveBeenCalledTimes(1)
    f.runtime.dispose()
  })
  it("publishes terminal exit after preceding output is parsed and only once across snapshots", async () => {
    const exited = vi.fn<(terminalId: string, code: number | null) => void>()
    const f = fixture({ onTerminalExit: exited })
    mount(f)
    await flush()
    f.push({ terminalId: id, sequence: 3, type: "output", data: "final output" })
    f.push({ terminalId: id, sequence: 4, type: "exited", exitCode: 7 })
    await flush()
    expect(exited).not.toHaveBeenCalled()
    screens[0]!.writes[0]!.parsed()
    await flush()
    expect(exited).toHaveBeenCalledWith(id, 7)
    expect(f.runtime.getTerminalStore(id).getState()).toMatchObject({
      status: "exited",
      control: false,
    })
    f.runtime.retryAttachment(id)
    await flush()
    f.push({
      terminalId: id,
      sequence: 4,
      type: "snapshot",
      data: "final output",
      cols: 80,
      rows: 24,
      status: "exited",
      exitCode: 7,
    })
    await flush()
    screens[0]!.writes.at(-1)!.parsed()
    await flush()
    expect(exited).toHaveBeenCalledTimes(1)
    f.runtime.dispose()
  })
  it("disposes detached terminals from a previous runtime without attaching their old IDs", async () => {
    const f = fixture()
    const unmount = mount(f)
    await flush()
    unmount()
    f.store.setState({ status: "reconnecting" })
    f.store.setState({
      status: "connected",
      generation: 2,
      runtimeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    })
    await flush()
    expect(f.attach).toHaveBeenCalledTimes(1)
    expect(screens[0]!.dispose).toHaveBeenCalledTimes(1)
    f.runtime.dispose()
  })
  it("falls back to observing when control is owned and suppresses handled application keys", async () => {
    const f = fixture()
    f.attach.mockRejectedValueOnce(
      Object.assign(new Error("Control in use"), { code: "CONTROL_IN_USE" }),
    )
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    )
    const handler = vi.fn<(event: KeyboardEvent) => boolean>(() => true)
    f.runtime.mount(id, f.container, { keyHandler: handler })
    await flush()
    expect(f.attach.mock.calls.map(([input]) => (input as { mode: string }).mode)).toEqual([
      "control",
      "observe",
    ])
    expect(f.runtime.getTerminalStore(id).getState().control).toBe(false)
    const event = new KeyboardEvent("keydown", { key: "t", ctrlKey: true, cancelable: true })
    expect(screens[0]!.key(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(handler).toHaveBeenCalledTimes(1)
    screens[0]!.emit("ordinary shell input")
    expect(f.write).not.toHaveBeenCalled()
    f.runtime.dispose()
  })
})
