import { vi } from "vitest"

import { createStore } from "../../model/store"
import { describe, expect, it } from "../../test"
import type { BackendConnectionState } from "../port"
import type { TerminalKey } from "../port"
import type { SurfaceRuntime } from "./backend"
import { createScreens, parkMs, retainMs } from "./screens"

// jsdom has no layout observers, media queries or canvas; xterm falls back without them.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  })
})

const keyOf = (terminalId: string): TerminalKey => ({
  projectId: "p",
  workspaceSessionId: "s",
  terminalId,
})
const options = { fontSize: 13, name: "T", waiting: false, webgl: false }

// Screens capped at `cap` over a runtime whose shells are ready and whose streams never
// draw, recording what the runtime is told and each attachment it is asked for.
const capped = (cap: number) => {
  const told: string[] = []
  const attached: string[] = []
  const runtime: SurfaceRuntime = {
    entry: () => ({
      ready: Promise.resolve(true),
      revived: new Promise<void>(() => {}),
      closed: false,
      size: { cols: 80, rows: 24 },
    }),
    attach: (terminalId) => {
      attached.push(String(terminalId))
      return new Promise(() => {})
    },
    upload: () => new Promise(() => {}),
    resized: () => {},
    attached: () => () => {},
    connected: async () => {},
    lost: () => {},
    restart: () => {},
    exited: () => {},
    connection: createStore<BackendConnectionState>("connected"),
    track: (work) => work,
    screen: ({ terminalId }, state) => void told.push(`${terminalId} ${state}`),
    shown: () => false,
  }
  const screens = createScreens(runtime, undefined, cap)
  // Shown in a slot, as a surface does.
  const show = (terminalId: string) => {
    const screen = screens.acquire(keyOf(terminalId), options)
    document.body.append(screens.host(keyOf(terminalId)))
    return screen
  }
  const hide = (terminalId: string) => screens.release(keyOf(terminalId))
  const present = (terminalId: string) => screens.host(keyOf(terminalId)).isConnected
  return { screens, told, attached, show, hide, present }
}

describe("the cap on parked screens", () => {
  it("closes the screen parked longest when another parks past the cap", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    try {
      const { told, show, hide, present } = capped(2)
      for (const id of ["a", "b", "c"]) {
        show(id)
        hide(id)
        vi.advanceTimersByTime(parkMs)
      }
      expect(told).toContain("a gone")
      expect(told).not.toContain("b gone")
      expect(told).not.toContain("c gone")
      expect(present("a")).toBe(false)
      expect(present("b")).toBe(true)
      expect(present("c")).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("never closes a screen that is shown or has not parked yet", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    try {
      const { told, show, hide } = capped(1)
      show("shown")
      for (const id of ["a", "b"]) {
        show(id)
        hide(id)
        vi.advanceTimersByTime(parkMs)
      }
      // Released a moment ago, `c` has not parked: the two parked ones are over the cap,
      // so the older closes, and neither `shown` nor `c` does.
      show("c")
      hide("c")
      vi.advanceTimersByTime(parkMs - 1)
      expect(told.filter((entry) => entry.endsWith("gone"))).toEqual(["a gone"])
      vi.advanceTimersByTime(1)
      expect(told.filter((entry) => entry.endsWith("gone"))).toEqual(["a gone", "b gone"])
    } finally {
      vi.useRealTimers()
    }
  })

  it("leaves the order when a screen is shown again, and parks last when it parks again", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    try {
      const { told, show, hide } = capped(2)
      for (const id of ["a", "b"]) {
        show(id)
        hide(id)
        vi.advanceTimersByTime(parkMs)
      }
      // `a` is shown and parked again, so `b` has been parked longest.
      show("a")
      hide("a")
      vi.advanceTimersByTime(parkMs)
      show("c")
      hide("c")
      vi.advanceTimersByTime(parkMs)
      expect(told.filter((entry) => entry.endsWith("gone"))).toEqual(["b gone"])
    } finally {
      vi.useRealTimers()
    }
  })

  it("opens a screen it closed afresh when shown again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    try {
      const { told, attached, show, hide } = capped(1)
      const first = show("a")
      await vi.advanceTimersByTimeAsync(0)
      hide("a")
      vi.advanceTimersByTime(parkMs)
      show("b")
      hide("b")
      vi.advanceTimersByTime(parkMs)
      expect(told).toContain("a gone")
      const before = attached.filter((id) => id === "a").length
      const again = show("a")
      await vi.advanceTimersByTimeAsync(0)
      expect(again).not.toBe(first)
      expect(told.filter((entry) => entry === "a mounted")).toHaveLength(2)
      expect(attached.filter((id) => id === "a").length).toBeGreaterThan(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it("closes a screen once, however it got there", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    try {
      const { told, show, hide } = capped(1)
      for (const id of ["a", "b"]) {
        show(id)
        hide(id)
        vi.advanceTimersByTime(parkMs)
      }
      vi.advanceTimersByTime(retainMs + 60_000)
      expect(told.filter((entry) => entry === "a gone")).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
