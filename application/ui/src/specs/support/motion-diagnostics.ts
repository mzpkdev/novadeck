type AnimationClock = Pick<Animation, "id" | "startTime" | "currentTime" | "playState" | "pending">
type MotionDocument = {
  startViewTransition: Document["startViewTransition"]
  readonly timeline: Pick<DocumentTimeline, "currentTime">
  readonly visibilityState: DocumentVisibilityState
  addEventListener: EventTarget["addEventListener"]
  removeEventListener: EventTarget["removeEventListener"]
}
export type MotionHost = {
  document: MotionDocument
  frame: typeof requestAnimationFrame
  cancel: typeof cancelAnimationFrame
  now: () => number
  wall: () => number
}
const clockValue = (value: CSSNumberish | null): number | string | null =>
  typeof value === "number" || value === null ? value : String(value).slice(0, 64)
const short = (value: unknown, limit: number): string | null =>
  typeof value === "string" ? value.slice(0, limit) : null

const errorInfo = (error: unknown) => {
  try {
    return error instanceof Error
      ? { name: error.name.slice(0, 64), message: error.message.slice(0, 160) }
      : { name: "non-Error" }
  } catch {
    return { name: "unreadable-error" }
  }
}

/** Test-only observer: no style/layout reads, added waits or animation mutation. */
export const motionDiagnostics = (
  host: MotionHost = {
    document,
    frame: requestAnimationFrame.bind(window),
    cancel: cancelAnimationFrame.bind(window),
    now: () => performance.now(),
    wall: () => Date.now(),
  },
) => {
  const doc = host.document
  const identities = new WeakMap<AnimationClock, number>()
  const seen = new Map<number, { first: number; last: number; samples: number }>()
  const events: object[] = []
  const samples: object[] = []
  const catalog = new Map<number, object>()
  const waits = new Map<number, { phase: string; settled: boolean }>()
  const raf: object[] = []
  const transitions = new Map<number, Record<string, string>>()
  const restore: (() => void)[] = []
  let active = true,
    errors = 0,
    dropped = 0,
    bytes = 0,
    ids = 0,
    polls = 0,
    calls = 0,
    sampleBytes = 0,
    sampleDropped = 0,
    lastPollSample = -Infinity,
    waitIds = 0,
    updateRejections = 0,
    callbackRejections = 0
  let last: object | undefined
  let frame: number | undefined,
    requested = 0,
    executed = 0,
    cancelled = 0,
    rafDropped = 0
  let lastFrame: object | undefined,
    lastSample = -Infinity
  const stamp = () => ({
    wall: host.wall(),
    ms: host.now(),
    timeline: clockValue(doc.timeline.currentTime),
    visibility: doc.visibilityState,
  })
  const note = (type: string, detail: object = {}) => {
    if (!active) return
    try {
      const event = { type, ...stamp(), ...detail }
      const size = JSON.stringify(event).length
      if (events.length < 128 && bytes + size <= 24 * 1024) {
        events.push(event)
        bytes += size
      } else dropped += 1
    } catch {
      errors += 1
    }
  }
  const observe = (
    id: number,
    name: "ready" | "updateCallbackDone" | "finished",
    promise: Promise<void>,
  ) => {
    transitions.get(id)![name] = "pending"
    // Both handlers avoid unhandled derived promises. The original promises/return values stay intact.
    void promise.then(
      () => {
        if (!active) return
        transitions.get(id)![name] = "resolved"
        note(`${name}.resolve`, { transition: id })
      },
      (error: unknown) => {
        if (!active) return
        transitions.get(id)![name] = "rejected"
        if (name === "updateCallbackDone") updateRejections += 1
        note(`${name}.reject`, {
          transition: id,
          error: errorInfo(error),
        })
      },
    )
  }
  const original = doc.startViewTransition
  const descriptor = Object.getOwnPropertyDescriptor(doc, "startViewTransition")
  if (typeof original === "function") {
    const wrapped: Document["startViewTransition"] = function (this: MotionDocument, ...args) {
      const id = ++calls
      if (id > 64) {
        dropped += 1
        return Reflect.apply(original, this, args) as ViewTransition
      }
      transitions.set(id, { call: "started", callback: "not-called" })
      note("start.call", { transition: id })
      const wrap = (update: ViewTransitionUpdateCallback): ViewTransitionUpdateCallback =>
        function (this: unknown, ...values: unknown[]) {
          transitions.get(id)!.callback = "started"
          note("callback.start", { transition: id })
          try {
            const value: unknown = Reflect.apply(update, this, values)
            if (value instanceof Promise) {
              transitions.get(id)!.callback = "pending"
              note("callback.return", { transition: id, kind: "same-realm-Promise" })
              // Native consumes this Promise too; observe it without changing the exact return.
              void value.then(
                () => {
                  if (!active) return
                  transitions.get(id)!.callback = "resolved"
                  note("callback.resolve", { transition: id })
                },
                (error: unknown) => {
                  if (!active) return
                  callbackRejections += 1
                  transitions.get(id)!.callback = "rejected"
                  note("callback.reject", { transition: id, error: errorInfo(error) })
                },
              )
            } else {
              transitions.get(id)!.callback =
                value !== null && (typeof value === "object" || typeof value === "function")
                  ? "other-return-unobserved"
                  : "synchronous-return"
              note("callback.return", { transition: id, kind: transitions.get(id)!.callback })
            }
            return value
          } catch (error) {
            callbackRejections += 1
            transitions.get(id)!.callback = "threw"
            note("callback.throw", {
              transition: id,
              error: errorInfo(error),
            })
            throw error
          }
        }
      const options = args[0]
      const forwarded = [...args]
      if (typeof options === "function") forwarded[0] = wrap(options)
      else if (options && typeof options === "object")
        forwarded[0] = new Proxy<StartViewTransitionOptions>(
          {},
          {
            get(_target, key) {
              // Let native dictionary conversion read getters once, with their original receiver.
              const value: unknown = Reflect.get(options, key, options)
              return key === "update" && typeof value === "function"
                ? wrap(value as ViewTransitionUpdateCallback)
                : value
            },
          },
        )
      let result: ViewTransition
      try {
        result = Reflect.apply(original, this, forwarded) as ViewTransition
      } catch (error) {
        note("start.throw", { transition: id })
        throw error
      }
      note("start.return", { transition: id })
      try {
        observe(id, "ready", result.ready)
        observe(id, "updateCallbackDone", result.updateCallbackDone)
        observe(id, "finished", result.finished)
        const skip = result.skipTransition
        const own = Object.getOwnPropertyDescriptor(result, "skipTransition")
        Object.defineProperty(result, "skipTransition", {
          configurable: true,
          writable: true,
          value: function (this: ViewTransition, ...values: unknown[]) {
            note("skip.call", { transition: id })
            try {
              return Reflect.apply(skip, this, values)
            } catch (error) {
              note("skip.throw", { transition: id })
              throw error
            }
          },
        })
        restore.push(() => {
          if (own) Object.defineProperty(result, "skipTransition", own)
          else Reflect.deleteProperty(result, "skipTransition")
        })
      } catch {
        errors += 1
      }
      return result
    }
    Object.defineProperty(doc, "startViewTransition", {
      configurable: true,
      writable: true,
      value: wrapped,
    })
    restore.push(() => {
      if (descriptor) Object.defineProperty(doc, "startViewTransition", descriptor)
      else Reflect.deleteProperty(doc, "startViewTransition")
    })
  } else note("start.unavailable")
  const visibility = () => note("visibility.change")
  doc.addEventListener("visibilitychange", visibility)
  const heartbeat = (timestamp: number) => {
    frame = undefined
    if (!active) return
    executed += 1
    lastFrame = { ...stamp(), timestamp, executed }
    if (host.now() - lastSample >= 100) {
      if (raf.length < 96) raf.push(lastFrame)
      else rafDropped += 1
      lastSample = host.now()
    }
    if (executed < 4096) {
      requested += 1
      frame = host.frame(heartbeat)
    } else note("raf.limit")
  }
  requested += 1
  frame = host.frame(heartbeat)
  note("capture.start")
  return {
    beginWait(phase: string) {
      const id = ++waitIds
      if (waits.size < 16) waits.set(id, { phase: phase.slice(0, 48), settled: false })
      else dropped += 1
      note("wait.start", { wait: id, phase: phase.slice(0, 48) })
      return id
    },
    settled(id: number) {
      const wait = waits.get(id)
      if (wait) wait.settled = true
      note("wait.settled", { wait: id })
    },
    sample(
      animations: readonly AnimationClock[],
      metadata: readonly Record<string, unknown>[] = [],
      wait = 0,
    ) {
      if (!active) return
      try {
        polls += 1
        const values = animations.slice(0, 64).map((animation, index) => {
          let id = identities.get(animation)
          if (id === undefined) {
            id = ++ids
            identities.set(animation, id)
          }
          const prior = seen.get(id)
          if (prior) {
            prior.last = polls
            prior.samples += 1
          } else if (seen.size < 256) seen.set(id, { first: polls, last: polls, samples: 1 })
          else dropped += 1
          const detail = metadata[index]
          if (!catalog.has(id) && catalog.size < 256)
            catalog.set(id, {
              nativeId: short(animation.id, 32),
              name: short(detail?.name, 48),
              pseudo: short(detail?.pseudo, 80),
              target: short(detail?.target, 96),
            })
          return {
            identity: id,
            startTime: clockValue(animation.startTime),
            currentTime: clockValue(animation.currentTime),
            pending: animation.pending,
            playState: animation.playState,
          }
        })
        last = {
          ...stamp(),
          poll: polls,
          wait,
          total: animations.length,
          omitted: Math.max(0, animations.length - 64),
          animations: values,
        }
        if (host.now() - lastPollSample >= 100 || animations.length === 0) {
          const size = JSON.stringify(last).length
          if (samples.length < 64 && sampleBytes + size <= 96 * 1024) {
            samples.push(last)
            sampleBytes += size
          } else sampleDropped += 1
          lastPollSample = host.now()
        }
      } catch {
        errors += 1
      }
    },
    stop() {
      if (!active) return undefined
      note("capture.stop")
      active = false
      if (frame !== undefined) {
        host.cancel(frame)
        cancelled += 1
        frame = undefined
      }
      doc.removeEventListener("visibilitychange", visibility)
      for (const undo of restore.toReversed()) {
        try {
          undo()
        } catch {
          errors += 1
        }
      }
      return {
        version: 1,
        errors,
        dropped,
        polls,
        identities: ids,
        updateRejections,
        callbackRejections,
        pendingCallbacks: [...transitions.values()].filter((value) => value.callback === "pending")
          .length,
        pendingUpdates: [...transitions.values()].filter(
          (value) => value.updateCallbackDone === "pending",
        ).length,
        waits: Object.fromEntries(waits),
        events,
        samples,
        sampleDropped,
        catalog: Object.fromEntries(catalog),
        last,
        seen: Object.fromEntries(seen),
        transitions: Object.fromEntries(transitions),
        heartbeat: {
          diagnostic: true,
          requested,
          executed,
          cancelled,
          dropped: rafDropped,
          limit: 4096,
          samples: raf,
          last: lastFrame,
        },
      }
    },
  }
}
