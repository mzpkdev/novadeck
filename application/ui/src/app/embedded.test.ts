import { afterEach, describe, expect, it, vi } from "vitest"

import { holdInputUntilEngaged } from "./embedded"

// A page and the frame the app runs in: jsdom's window stands for the frame, with a
// parent that records what the app tells it.
const framed = () => {
  const frame = document.createElement("iframe")
  document.body.append(frame)
  const app = frame.contentWindow as Window & typeof globalThis
  const parent = { postMessage: vi.fn<Window["postMessage"]>() } as unknown as Window
  Object.defineProperty(app, "parent", { value: parent })
  return {
    app,
    parent,
    posted: parent.postMessage as ReturnType<typeof vi.fn>,
  }
}

const wheel = (app: Window & typeof globalThis, init: WheelEventInit = {}): WheelEvent => {
  const event = new app.WheelEvent("wheel", {
    cancelable: true,
    bubbles: true,
    ...init,
  })
  app.document.body.dispatchEvent(event)
  return event
}

const engage = (app: Window & typeof globalThis, source: Window): void => {
  app.dispatchEvent(
    new app.MessageEvent("message", {
      data: { type: "novadeck:engaged" },
      source,
    }),
  )
}

describe("holdInputUntilEngaged", () => {
  afterEach(() => document.body.replaceChildren())

  it("hands the wheel to the page around the app and keeps it from the app", () => {
    const { app, posted } = framed()
    const reached = vi.fn<() => void>()
    app.document.body.addEventListener("wheel", reached)
    holdInputUntilEngaged(app)
    const event = wheel(app, { deltaX: 3, deltaY: 40 })
    expect(event.defaultPrevented).toBe(true)
    expect(reached).not.toHaveBeenCalled()
    expect(posted).toHaveBeenCalledWith({ type: "novadeck:wheel", deltaX: 3, deltaY: 40 }, "*")
  })

  it("passes a wheel in lines or pages on as pixels", () => {
    const { app, posted } = framed()
    holdInputUntilEngaged(app)
    wheel(app, { deltaY: 3, deltaMode: 1 })
    wheel(app, { deltaY: 1, deltaMode: 2 })
    expect(posted).toHaveBeenNthCalledWith(
      1,
      { type: "novadeck:wheel", deltaX: 0, deltaY: 48 },
      "*",
    )
    expect(posted).toHaveBeenNthCalledWith(
      2,
      { type: "novadeck:wheel", deltaX: 0, deltaY: app.innerHeight },
      "*",
    )
  })

  it("keeps a zoom gesture from the app without handing it up", () => {
    const { app, posted } = framed()
    holdInputUntilEngaged(app)
    expect(wheel(app, { deltaY: -20, ctrlKey: true }).defaultPrevented).toBe(true)
    expect(wheel(app, { deltaY: -20, metaKey: true }).defaultPrevented).toBe(true)
    expect(posted).not.toHaveBeenCalled()
  })

  it("lets the app have the wheel for good once its page engages it", () => {
    const { app, parent, posted } = framed()
    holdInputUntilEngaged(app)
    engage(app, parent)
    expect(wheel(app, { deltaY: 40 }).defaultPrevented).toBe(false)
    expect(posted).not.toHaveBeenCalled()
    // A later hold, as a reboot makes, finds it engaged.
    holdInputUntilEngaged(app)
    expect(wheel(app, { deltaY: 40 }).defaultPrevented).toBe(false)
  })

  it("ignores an engaged message from any other sender", () => {
    const { app, posted } = framed()
    holdInputUntilEngaged(app)
    engage(app, app)
    app.dispatchEvent(
      new app.MessageEvent("message", {
        data: "novadeck:engaged",
        source: app.parent,
      }),
    )
    expect(wheel(app, { deltaY: 40 }).defaultPrevented).toBe(true)
    expect(posted).toHaveBeenCalledOnce()
  })

  it("holds nothing where the app is not framed", () => {
    const stop = holdInputUntilEngaged(window)
    expect(wheel(window, { deltaY: 40 }).defaultPrevented).toBe(false)
    stop()
  })

  it("lets go when lifted", () => {
    const { app, posted } = framed()
    holdInputUntilEngaged(app)()
    expect(wheel(app, { deltaY: 40 }).defaultPrevented).toBe(false)
    expect(posted).not.toHaveBeenCalled()
  })
})
