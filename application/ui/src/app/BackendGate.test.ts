import { act, createElement, StrictMode } from "react"
import { afterEach } from "vitest"

import type { Backend, BackendConnection, BackendSelection } from "../backend/port"
import { context, describe, expect, it } from "../test"
import { render, type Rendered } from "../test/render"
import { BackendGate } from "./BackendGate"

const mounted: Rendered[] = []
afterEach(() => mounted.splice(0).forEach((page) => page.unmount()))

const createBackend = (): Backend => {
  throw new Error("not created in these tests")
}

// A connection the test settles by hand, counting how often each attempt was closed.
const pending = () => {
  const attempts: {
    readonly signal: AbortSignal
    readonly resolve: (connection: BackendConnection) => void
    readonly reject: (error: Error) => void
  }[] = []
  const selection: BackendSelection = {
    connect: (signal) =>
      new Promise((resolve, reject) => attempts.push({ signal, resolve, reject })),
  }
  return { selection, attempts }
}

const show = (selection: BackendSelection): Rendered => {
  const page = render(
    createElement(
      StrictMode,
      null,
      createElement(BackendGate, { selection, render: () => "workspace" }),
    ),
  )
  mounted.push(page)
  return page
}

describe("backend gate", () => {
  context("while the backend connects", () => {
    it("says so and nothing else", () => {
      const { container } = show(pending().selection)
      expect(container.textContent).toBe("Connecting…")
    })
  })

  context("when the first connection fails", () => {
    it("shows the error in its place", async () => {
      const { selection, attempts } = pending()
      const { container } = show(selection)
      await act(async () => attempts.at(-1)!.reject(new Error("Runner unavailable: UNAUTHORIZED")))
      expect(container.textContent).toBe("Runner unavailable: UNAUTHORIZED")
    })
  })

  context("once connected", () => {
    it("renders the workspace and closes the connection when unmounted", async () => {
      const { selection, attempts } = pending()
      const page = show(selection)
      let closed = 0
      await act(async () => attempts.at(-1)!.resolve({ createBackend, close: () => closed++ }))
      expect(page.container.textContent).toBe("workspace")
      page.unmount()
      mounted.splice(0)
      expect(closed).toBe(1)
    })

    it("closes a connection StrictMode abandoned", async () => {
      const { selection, attempts } = pending()
      show(selection)
      expect(attempts.map((attempt) => attempt.signal.aborted)).toEqual([true, false])
      let closed = 0
      await act(async () => attempts[0]!.resolve({ createBackend, close: () => closed++ }))
      expect(closed).toBe(1)
    })
  })

  context("with a backend that needs no connection", () => {
    it("renders the workspace at once", () => {
      const { container } = show({ createBackend })
      expect(container.textContent).toBe("workspace")
    })
  })
})
