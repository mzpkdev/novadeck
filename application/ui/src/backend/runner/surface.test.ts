import { act, createElement } from "react"
import { afterEach, vi } from "vitest"

import { createStore } from "../../model/store"
import { context, describe, expect, it } from "../../test"
import { terminalFixture } from "../../test/fixtures"
import { render, type Rendered } from "../../test/render"
import type { BackendConnectionState } from "../port"
import type { RunnerEntry, SurfaceRuntime } from "./backend"
import { createRunnerTerminal } from "./RunnerTerminal"

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

const mounted: Rendered[] = []
afterEach(() => mounted.splice(0).forEach((page) => page.unmount()))

const key = { projectId: "p", workspaceSessionId: "s", terminalId: "01" }

// A runtime whose shell is starting and never gets a stream, as while it respawns.
const starting = () => {
  const connection = createStore<BackendConnectionState>("connected")
  const entry = {
    ready: new Promise<boolean>(() => {}),
    revived: new Promise<void>(() => {}),
    closed: false,
  } as unknown as RunnerEntry
  const runtime: SurfaceRuntime = {
    entry: () => entry,
    attach: () => new Promise(() => {}),
    connected: async () => {},
    lost: () => {},
    restart: () => {},
    exited: () => {},
    connection,
    track: (work) => work,
  }
  return { runtime, connection }
}

const show = (runtime: SurfaceRuntime) => {
  const Surface = createRunnerTerminal(runtime)
  const page = render(
    createElement(Surface, {
      terminalKey: key,
      terminal: { ...terminalFixture(1, "~"), state: "starting" },
      projectName: "P",
      fontSize: 13,
      focusInput: false,
      onInputFocused: () => {},
    }),
  )
  mounted.push(page)
  return page
}

const input = (page: Rendered) => page.container.querySelector("[data-terminal-input]")!

describe("runner terminal surface", () => {
  context("while its shell has no stream yet", () => {
    it("refuses input where the person can see it", () => {
      const { runtime } = starting()
      const page = show(runtime)
      expect(input(page).getAttribute("aria-disabled")).toBe("true")
      expect(page.container.querySelector("[role=status]")?.textContent).toBe(
        "Starting · input paused",
      )
    })
  })

  context("while the runner reconnects", () => {
    it("says so over the dimmed screen", () => {
      const { runtime, connection } = starting()
      const page = show(runtime)
      act(() => void connection.update(() => "reconnecting"))
      expect(page.container.querySelector("[role=status]")?.textContent).toBe(
        "Reconnecting · input paused",
      )
    })
  })
})
