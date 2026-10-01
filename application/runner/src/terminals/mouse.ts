import type { Terminal } from "@xterm/headless"

/**
 * How a terminal encodes the mouse's reports: X10's bytes by default, or SGR's
 * parameters, in cells or in pixels. xterm.js keeps its own to itself.
 */
export type MouseEncoding = "default" | "sgr" | "sgr-pixels"

/**
 * Follows the mouse's encoding a program sets on `screen`, as xterm.js does: DECSET and
 * DECRST 1006 and 1016, and a full reset. Its handlers let xterm.js handle each sequence
 * too. Returns the current encoding.
 */
export const watchMouseEncoding = (screen: Terminal): (() => MouseEncoding) => {
  let encoding: MouseEncoding = "default"
  const set = (on: boolean) => (params: (number | number[])[]) => {
    for (const param of params) {
      if (param === 1006) encoding = on ? "sgr" : "default"
      if (param === 1016) encoding = on ? "sgr-pixels" : "default"
    }
    return false
  }
  screen.parser.registerCsiHandler({ prefix: "?", final: "h" }, set(true))
  screen.parser.registerCsiHandler({ prefix: "?", final: "l" }, set(false))
  screen.parser.registerEscHandler({ final: "c" }, () => {
    encoding = "default"
    return false
  })
  return () => encoding
}

/** What restores `encoding` on a fresh terminal, which starts with the default. */
export const restoreMouseEncoding = (encoding: MouseEncoding): string =>
  encoding === "sgr" ? "\x1b[?1006h" : encoding === "sgr-pixels" ? "\x1b[?1016h" : ""
