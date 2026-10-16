import { act } from "react"
import { vi } from "vitest"

// The counter run's clock. Timers, animation frames, Date and performance are fake, so
// time moves only when the script moves it: the park timer, xterm's writes (a timer) and
// its paints (an animation frame) land on the same frame every run. React works inside
// `act`, which renders and runs effects at the end of each frame instead of whenever the
// browser schedules it. What the browser still does in real time, as a ResizeObserver
// reporting a new size, happens on a real frame awaited inside each fake one, so it falls
// in that frame too.

export const frameMs = 16
// The epoch the clock starts at, so dates read the same every run.
const start = new Date("2026-01-01T00:00:00Z")

export type Clock = {
  // Moves the clock one frame, or as many as `ms` takes, letting everything due run.
  readonly frames: (count: number, real?: boolean) => Promise<void>
  readonly advance: (ms: number) => Promise<void>
  // Does something as one step: what it changes renders and paints over `frames` frames.
  readonly step: (action: () => unknown, frames?: number) => Promise<void>
  readonly stop: () => void
}

// A real task's turn, for promise chains that cross one, without waiting for a frame.
const nextTask = () =>
  new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel()
    port1.addEventListener("message", () => resolve(), { once: true })
    port1.start()
    port2.postMessage(undefined)
  })

export const startClock = (): Clock => {
  const realFrame = window.requestAnimationFrame.bind(window)
  const nextRealFrame = () => new Promise<void>((resolve) => realFrame(() => resolve()))
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  // Rendering helpers turn React's act environment off after their own `act`; each of
  // these turns it on again.
  const inAct = (work: () => Promise<void>) => {
    environment.IS_REACT_ACT_ENVIRONMENT = true
    return act(work)
  }
  vi.useFakeTimers({
    now: start,
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "performance",
    ],
  })
  // One frame: the fake clock's timers and animation frames due in it, inside one `act`,
  // then a real frame for the browser's own observers where something may have moved, or
  // else a real task's turn.
  const frame = (real: boolean) =>
    inAct(async () => {
      vi.advanceTimersByTime(frameMs)
      await nextTask()
      if (real) await nextRealFrame()
    })
  const frames = async (count: number, real = true): Promise<void> => {
    // eslint-disable-next-line no-await-in-loop -- Frames run one after another.
    for (let index = 0; index < count; index += 1) await frame(real)
  }
  return {
    frames,
    // Waits as nothing new happens: real frames only at the end, as the browser has nothing
    // of its own to report until then.
    advance: async (ms) => {
      const count = Math.ceil(ms / frameMs)
      await frames(Math.max(0, count - 2), false)
      await frames(Math.min(count, 2))
    },
    step: async (action, count = 2) => {
      await inAct(async () => {
        await action()
        await nextRealFrame()
      })
      await frames(count)
    },
    stop: () => {
      vi.useRealTimers()
      environment.IS_REACT_ACT_ENVIRONMENT = false
    },
  }
}
