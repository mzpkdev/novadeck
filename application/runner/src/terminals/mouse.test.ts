import headless from "@xterm/headless"

import { describe, expect, it } from "../test.js"
import { watchMouseEncoding } from "./mouse.js"

const { Terminal } = headless

// xterm.js's own encoding, which it keeps to itself; the watcher must agree with it.
const internal = (screen: InstanceType<typeof Terminal>): string =>
  // eslint-disable-next-line no-underscore-dangle -- Its only way out is its internals.
  (screen as unknown as { _core: { coreMouseService: { activeEncoding: string } } })._core
    .coreMouseService.activeEncoding

describe("the mouse's encoding on a screen", () => {
  it("follows what a program sets, as xterm.js does", async () => {
    const screen = new Terminal({ cols: 20, rows: 4, allowProposedApi: true })
    const encoding = watchMouseEncoding(screen)
    const steps: readonly (readonly [string, string, string])[] = [
      ["", "default", "DEFAULT"],
      ["\x1b[?1000h\x1b[?1006h", "sgr", "SGR"],
      ["\x1b[?1006l", "default", "DEFAULT"],
      ["\x1b[?1003;1016h", "sgr-pixels", "SGR_PIXELS"],
      ["\x1b[?1006h", "sgr", "SGR"],
      // Turning off one it no longer uses still goes back to the default, as in xterm.js.
      ["\x1b[?1016l", "default", "DEFAULT"],
      ["\x1b[?1006;1016h", "sgr-pixels", "SGR_PIXELS"],
      // A full reset; a soft one leaves it.
      ["\x1b[!p", "sgr-pixels", "SGR_PIXELS"],
      ["\x1bc", "default", "DEFAULT"],
      // urxvt's and UTF-8's, which xterm.js doesn't support.
      ["\x1b[?1015h\x1b[?1005h", "default", "DEFAULT"],
    ]
    try {
      for (const [data, expected, xterm] of steps) {
        // eslint-disable-next-line no-await-in-loop -- Each step follows the last.
        await new Promise<void>((resolve) => screen.write(data, resolve))
        expect([encoding(), internal(screen)]).toEqual([expected, xterm])
      }
    } finally {
      screen.dispose()
    }
  })
})
