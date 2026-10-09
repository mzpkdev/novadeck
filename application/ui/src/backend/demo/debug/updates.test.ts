import { afterEach, vi } from "vitest"

import { describe, expect, it } from "../../../test"
import { createDemoUpdates, restartingForMs } from "./updates"

afterEach(() => vi.useRealTimers())

describe("demo updates", () => {
  it("tells a listener of an update offered, then of a newer one", () => {
    const { updates, offer } = createDemoUpdates()
    const heard: string[] = []
    const stop = updates.onReady((version) => heard.push(version))
    offer("0.0.80")
    offer("0.0.81")
    stop()
    offer("0.0.82")
    expect(heard).toEqual(["0.0.80", "0.0.81"])
  })

  it("tells a listener that comes later of the update already waiting", () => {
    const { updates, offer } = createDemoUpdates()
    offer("0.0.80")
    const heard: string[] = []
    updates.onReady((version) => heard.push(version))()
    expect(heard).toEqual(["0.0.80"])
  })

  it("restarts only while an update waits, after a moment the footer can show", () => {
    vi.useFakeTimers()
    let restarts = 0
    const { updates, offer } = createDemoUpdates(() => void (restarts += 1))
    updates.install()
    vi.advanceTimersByTime(restartingForMs)
    expect(restarts).toBe(0)
    offer("0.0.80")
    updates.install()
    vi.advanceTimersByTime(restartingForMs - 1)
    expect(restarts).toBe(0)
    vi.advanceTimersByTime(1)
    expect(restarts).toBe(1)
  })
})
