import type { IpcMainEvent } from "electron"
import { afterEach, beforeEach, vi } from "vitest"

import { saveBeforeQuitChannel } from "../bridge.js"
import { context, describe, expect, it } from "../test"
import { savePages } from "./quit"

// Pages that record the requests they get, answering over a stand-in for ipcMain.
const quitting = (count: number) => {
  const listeners = new Set<(event: IpcMainEvent) => void>()
  const asked: number[] = []
  const pages = Array.from({ length: count }, (_, index) => ({
    send: (channel: string) => {
      if (channel === saveBeforeQuitChannel) asked.push(index)
    },
  }))
  const ipc = {
    on: (_channel: string, listener: (event: IpcMainEvent) => void) => listeners.add(listener),
    removeListener: (_channel: string, listener: (event: IpcMainEvent) => void) =>
      listeners.delete(listener),
  }
  let done = false
  const saved = savePages(ipc, pages, {
    sender: (event) => (event as unknown as { page?: (typeof pages)[number] }).page,
    timeoutMs: 1_500,
  }).then(() => {
    done = true
  })
  const answer = (page: (typeof pages)[number] | undefined) =>
    [...listeners].forEach((listener) => listener({ page } as unknown as IpcMainEvent))
  return { pages, asked, saved, answer, done: () => done, listening: () => listeners.size }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("saving before quit", () => {
  it("asks every page and goes on once each has answered", async () => {
    const app = quitting(2)
    expect(app.asked).toEqual([0, 1])
    app.answer(app.pages[0])
    await vi.advanceTimersByTimeAsync(0)
    expect(app.done()).toBe(false)
    app.answer(app.pages[1])
    await app.saved
    expect(app.listening()).toBe(0)
  })

  it("ignores answers from anything but the app's own pages", async () => {
    const app = quitting(1)
    app.answer(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(app.done()).toBe(false)
  })

  context("when a page does not answer", () => {
    it("goes on after the wait, so quitting cannot hang", async () => {
      const app = quitting(1)
      await vi.advanceTimersByTimeAsync(1_499)
      expect(app.done()).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(app.done()).toBe(true)
      expect(app.listening()).toBe(0)
    })
  })

  context("with no page open", () => {
    it("goes on at once", async () => {
      const app = quitting(0)
      await app.saved
      expect(app.asked).toEqual([])
    })
  })
})
