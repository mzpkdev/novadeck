import type { IParser } from "@xterm/xterm"

const consumed = () => true

/** The runtime's persistent headless screen owns VT query replies, including while detached.
 * Consume these output-only queries in the renderer; keyboard/paste events stay untouched.
 */
export const deferDeviceResponsesToRuntime = (parser: IParser): void => {
  parser.registerCsiHandler({ final: "c" }, consumed)
  parser.registerCsiHandler({ prefix: ">", final: "c" }, consumed)
  parser.registerCsiHandler({ final: "n" }, consumed)
  parser.registerCsiHandler({ prefix: "?", final: "n" }, consumed)
  parser.registerCsiHandler({ intermediates: "$", final: "p" }, consumed)
  parser.registerCsiHandler({ prefix: "?", intermediates: "$", final: "p" }, consumed)
  parser.registerDcsHandler({ intermediates: "$", final: "q" }, consumed)
}
