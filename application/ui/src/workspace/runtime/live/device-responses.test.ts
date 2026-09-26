import { Terminal } from "@xterm/xterm"
import { describe, expect, it } from "vitest"

import { deferDeviceResponsesToRuntime } from "./device-responses"

const parsed = (terminal: Terminal, data: string) =>
  new Promise<void>((resolve) => terminal.write(data, resolve))

describe("renderer device queries", () => {
  it("lets the runtime answer supported device queries without duplicate renderer input", async () => {
    const terminal = new Terminal()
    const inputs: string[] = []
    terminal.onData((data) => inputs.push(data))
    try {
      await parsed(terminal, "\x1b[6n")
      expect(inputs).toEqual(["\x1b[1;1R"])
      inputs.length = 0
      deferDeviceResponsesToRuntime(terminal.parser)
      terminal.reset()
      await parsed(terminal, "\x1b[6n\x1b[5n\x1b[?6n\x1b[c\x1b[>c\x1b[4$p\x1b[?1$p\x1bP$qm\x1b\\")
      expect(inputs).toEqual([])
      await parsed(terminal, "still visible")
      expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe("still visible")
    } finally {
      terminal.dispose()
    }
  })
  it("keeps genuine input during asynchronous parsing, including escape sequences", async () => {
    const terminal = new Terminal()
    const inputs: string[] = []
    terminal.onData((data) => inputs.push(data))
    deferDeviceResponsesToRuntime(terminal.parser)
    try {
      const processing = parsed(terminal, "\x1b[6n".repeat(100))
      terminal.input("user input\r", true)
      terminal.input("\x1b[1;1R", true)
      await processing
      expect(inputs).toEqual(["user input\r", "\x1b[1;1R"])
    } finally {
      terminal.dispose()
    }
  })
})
