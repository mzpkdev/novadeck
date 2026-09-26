import type { TerminalEvent } from "@novadeck/protocol"
import { describe, expect, it } from "vitest"

import { applyTerminalEvent, type TerminalScreen } from "./events"

const terminalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
describe("terminal event application", () => {
  it("resets and sizes a snapshot before writing, and completes only after parsing", async () => {
    const calls: string[] = []
    let parsed: (() => void) | undefined
    const screen: TerminalScreen = {
      reset: () => {
        calls.push("reset")
      },
      resize: (cols, rows) => {
        calls.push(`resize ${cols} ${rows}`)
      },
      write: (data, callback) => {
        calls.push(`write ${data}`)
        parsed = callback
      },
    }
    let complete = false
    const applied = applyTerminalEvent(screen, {
      terminalId,
      sequence: 4,
      type: "snapshot",
      data: "screen",
      cols: 80,
      rows: 24,
      status: "running",
      exitCode: null,
    }).then(() => {
      complete = true
    })
    await Promise.resolve()
    expect(calls).toEqual(["reset", "resize 80 24", "write screen"])
    expect(complete).toBe(false)
    parsed!()
    await applied
    expect(complete).toBe(true)
  })
  it("applies ordered output and resize without resetting the existing screen", async () => {
    const calls: string[] = []
    const screen: TerminalScreen = {
      reset: () => {
        calls.push("reset")
      },
      resize: (cols, rows) => {
        calls.push(`resize ${cols} ${rows}`)
      },
      write: (data, callback) => {
        calls.push(data)
        callback()
      },
    }
    const events: TerminalEvent[] = [
      { type: "output", terminalId, sequence: 5, data: "continued" },
      { type: "resized", terminalId, sequence: 6, cols: 100, rows: 30 },
      { type: "exited", terminalId, sequence: 7, exitCode: 0 },
    ]
    for (const event of events) {
      // eslint-disable-next-line no-await-in-loop -- Exercise the terminal protocol in sequence.
      await applyTerminalEvent(screen, event)
    }
    expect(calls).toEqual(["continued", "resize 100 30"])
  })
})
