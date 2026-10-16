import { describe, expect, it } from "vitest"

import { motionDiagnostics, type MotionHost } from "./support/motion-diagnostics"

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const fixture = () => {
  const ready = deferred(),
    updated = deferred(),
    finished = deferred()
  const frames = new Map<number, FrameRequestCallback>()
  let now = 0,
    ids = 0,
    visibility: DocumentVisibilityState = "visible"
  let callback: ViewTransitionUpdateCallback | undefined | null
  let callbackResult: unknown
  const receivers: { nativeReceiver?: unknown; skipReceiver?: unknown } = {}
  const skipResult = { skipped: true }
  const native = function (
    this: unknown,
    options?: ViewTransitionUpdateCallback | StartViewTransitionOptions,
  ) {
    receivers.nativeReceiver = this
    callback = typeof options === "function" ? options : options?.update
    // As native dictionary conversion does, read each option only as it is consumed.
    if (options && typeof options === "object") void options.types
    return transition
  }
  const skip = function (this: unknown) {
    receivers.skipReceiver = this
    return skipResult
  }
  const transition = {
    ready: ready.promise,
    updateCallbackDone: updated.promise,
    finished: finished.promise,
    types: new Set<string>(),
    skipTransition: skip,
  }
  class TestDocument extends EventTarget {
    startViewTransition = native
    timeline = { currentTime: 0 }
    get visibilityState() {
      return visibility
    }
  }
  const doc = new TestDocument()
  const host: MotionHost = {
    document: doc,
    frame: (next) => {
      frames.set(++ids, next)
      return ids
    },
    cancel: (id) => {
      frames.delete(id)
    },
    now: () => now,
    wall: () => 1_700_000_000_000 + now,
  }
  const beat = (ms = 100) => {
    now += ms
    doc.timeline.currentTime = now
    const first = frames.entries().next().value
    if (first) {
      frames.delete(first[0])
      first[1](now)
    }
  }
  return {
    host,
    doc,
    transition,
    native,
    skip,
    skipResult,
    ready,
    updated,
    finished,
    frames,
    beat,
    update: (receiver?: unknown) => {
      callbackResult = callback && Reflect.apply(callback, receiver, [])
      return callbackResult
    },
    receivers: () => receivers,
    visibility: (next: DocumentVisibilityState) => {
      visibility = next
      doc.dispatchEvent(new Event("visibilitychange"))
    },
  }
}

describe("motion diagnostic observer", () => {
  it("keeps animation identities across polls and distinguishes recreated pending objects", () => {
    const test = fixture(),
      capture = motionDiagnostics(test.host)
    const animation = {
      id: "",
      startTime: null,
      currentTime: 0,
      pending: true,
      playState: "running" as const,
    }
    const wait = capture.beginWait("Canvas")
    capture.sample([animation], [], wait)
    test.beat()
    capture.sample([animation], [], wait)
    test.beat()
    capture.sample([{ ...animation }], [], wait)
    const result = capture.stop()!
    expect(result.identities).toBe(2)
    expect(result.seen).toMatchObject({
      1: { first: 1, last: 2, samples: 2 },
      2: { first: 3, last: 3, samples: 1 },
    })
    expect(result.samples).toHaveLength(3)
    expect(result.waits).toEqual({ 1: { phase: "Canvas", settled: false } })
    expect(result.heartbeat.executed).toBe(2)
  })
  it("preserves native and callback receivers, exact promises/transition/skip return and lifecycle", async () => {
    const test = fixture(),
      capture = motionDiagnostics(test.host),
      callback = deferred()
    const receiver = { callback: true }
    const updateReceivers: unknown[] = []
    const result = test.doc.startViewTransition(function (this: unknown) {
      updateReceivers.push(this)
      return callback.promise
    })
    expect(result).toBe(test.transition)
    expect(test.receivers().nativeReceiver).toBe(test.doc)
    expect(test.update(receiver)).toBe(callback.promise)
    expect(updateReceivers).toEqual([receiver])
    expect(Reflect.apply(result.skipTransition, result, [])).toBe(test.skipResult)
    expect(test.receivers().skipReceiver).toBe(test.transition)
    callback.resolve()
    test.updated.resolve()
    test.ready.reject(new DOMException("synthetic skip", "AbortError"))
    test.finished.resolve()
    await Promise.allSettled([
      callback.promise,
      result.ready,
      result.updateCallbackDone,
      result.finished,
    ])
    const recorded = capture.stop()!
    expect(recorded.transitions).toEqual({
      1: {
        call: "started",
        callback: "resolved",
        ready: "rejected",
        updateCallbackDone: "resolved",
        finished: "resolved",
      },
    })
    expect(recorded.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "callback.start" }),
        expect.objectContaining({ type: "callback.resolve" }),
        expect.objectContaining({ type: "skip.call" }),
      ]),
    )
    expect(test.doc.startViewTransition).toBe(test.native)
    expect(result.skipTransition).toBe(test.skip)
  })
  it("accepts frozen callback options while preserving getter receivers and callback rejection", async () => {
    const test = fixture(),
      capture = motionDiagnostics(test.host)
    let reads = 0
    const getterReceivers: unknown[] = []
    const failure = new TypeError("synthetic update failure")
    const options = Object.freeze({
      get update() {
        reads += 1
        getterReceivers.push(this)
        return () => {
          throw failure
        }
      },
      types: ["synthetic"],
    })
    const result = test.doc.startViewTransition(options)
    expect(reads).toBe(1)
    expect(getterReceivers).toEqual([options])
    let thrown: unknown
    try {
      test.update()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(failure)
    test.updated.reject(failure)
    test.ready.reject(failure)
    test.finished.reject(failure)
    await expect(result.updateCallbackDone).rejects.toBe(failure)
    await expect(result.ready).rejects.toBe(failure)
    await expect(result.finished).rejects.toBe(failure)
    const recorded = capture.stop()!
    expect(recorded.updateRejections).toBe(1)
    expect(recorded.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "callback.throw",
          error: { name: "TypeError", message: "synthetic update failure" },
        }),
        expect.objectContaining({ type: "updateCallbackDone.reject" }),
      ]),
    )
  })
  it("keeps lifecycle evidence after animation history overflows and cleans all active observers", async () => {
    const test = fixture(),
      capture = motionDiagnostics(test.host)
    const result = test.doc.startViewTransition(() => undefined)
    const animations = Array.from({ length: 64 }, () => ({
      id: "",
      startTime: null,
      currentTime: 0,
      pending: true,
      playState: "running" as const,
    }))
    for (let step = 0; step < 100; step += 1) {
      test.beat()
      capture.sample(animations)
    }
    test.updated.resolve()
    test.ready.resolve()
    test.finished.resolve()
    await result.finished
    test.visibility("hidden")
    const recorded = capture.stop()!
    expect(recorded.sampleDropped).toBeGreaterThan(0)
    expect(recorded.samples.length).toBeLessThanOrEqual(64)
    expect(recorded.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "finished.resolve" }),
        expect.objectContaining({ type: "visibility.change", visibility: "hidden" }),
      ]),
    )
    expect(test.frames.size).toBe(0)
    expect(recorded.heartbeat.cancelled).toBe(1)
    expect(JSON.stringify(recorded).length).toBeLessThan(256 * 1024)
    test.visibility("visible")
    test.beat()
    expect(capture.stop()).toBeUndefined()
    expect(test.doc.startViewTransition).toBe(test.native)
  })
  it("preserves a synchronous native start failure and still restores/cancels observation", () => {
    const test = fixture()
    const failure = new RangeError("synthetic native failure")
    const native = () => {
      throw failure
    }
    test.doc.startViewTransition = native
    const capture = motionDiagnostics(test.host)
    let thrown: unknown
    try {
      test.doc.startViewTransition(() => undefined)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(failure)
    const result = capture.stop()!
    expect(result.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "start.throw" })]),
    )
    expect(test.doc.startViewTransition).toBe(native)
    expect(test.frames.size).toBe(0)
  })
  it("marks pending updates incomplete before a late rejection can be consumed", async () => {
    const test = fixture(),
      capture = motionDiagnostics(test.host)
    const callback = deferred()
    const result = test.doc.startViewTransition(() => callback.promise)
    expect(test.update()).toBe(callback.promise)
    callback.resolve()
    await callback.promise
    const recorded = capture.stop()!
    expect(recorded.pendingUpdates).toBe(1)
    expect(recorded.pendingCallbacks).toBe(0)
    expect(recorded.transitions).toMatchObject({
      1: { callback: "resolved", updateCallbackDone: "pending" },
    })
    const failure = new TypeError("synthetic late failure")
    test.updated.reject(failure)
    test.ready.reject(failure)
    test.finished.reject(failure)
    await expect(result.updateCallbackDone).rejects.toBe(failure)
    await expect(result.ready).rejects.toBe(failure)
    await expect(result.finished).rejects.toBe(failure)
    expect(capture.stop()).toBeUndefined()
    expect(test.frames.size).toBe(0)
  })
})
