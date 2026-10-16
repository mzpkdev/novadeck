import { randomUUID } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

const load = async () => {
  const dispatch = vi.fn<(event: unknown) => void>()
  vi.stubGlobal("window", { dispatchEvent: dispatch })
  vi.stubGlobal(
    "CustomEvent",
    class {
      constructor(
        readonly type: string,
        readonly options: { detail: unknown },
      ) {}
    },
  )
  const events = await import(
    `${new URL("./uninstall-events.mjs", import.meta.url).href}?unit=${randomUUID()}`
  )
  return { events, dispatch }
}
afterEach(() => vi.unstubAllGlobals())

describe("uninstall source timeline", () => {
  it("retains a late result after the per-case listener has been removed", async () => {
    const { events, dispatch } = await load()
    events.setCase(8)
    events.note("fixture-scheduled", { originCase: 8 })
    events.setCase(null)
    events.note("result", { originCase: 8 })
    const saved = events.timeline()
    expect(saved.total).toBe(2)
    expect(saved.dropped).toBe(0)
    expect(saved.events[1]).toMatchObject({ stage: "result", originCase: 8, observedCase: null })
    expect(typeof saved.events[1].now).toBe("number")
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it("bounds records, reports overflow and keeps snapshots stable", async () => {
    const { events } = await load()
    for (let index = 0; index < 1005; index += 1) events.note("poll-sample", { index })
    const saved = events.timeline()
    expect(saved).toMatchObject({ total: 1005, dropped: 5 })
    expect(saved.events).toHaveLength(1000)
    expect(saved.events[0].index).toBe(5)
    events.note("result")
    expect(saved.events).toHaveLength(1000)
    expect(saved.total).toBe(1005)
    expect(events.timeline().dropped).toBe(6)
  })
})
