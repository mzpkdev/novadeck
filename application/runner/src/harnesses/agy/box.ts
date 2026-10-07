import { ruledBox, type BoxProfile } from "../box.js"

/**
 * Antigravity's input box: between two `─` rules, `> ` leading its first row and the rest
 * indented (probed 1.2.14 and 1.3.1, fixtures/input-box.probe.json). Its history above
 * echoes the person's turns the same way, rules and all, so only the lowest pair is the
 * box. A paste of more than ten lines shows as `[Pasted text #1 +40 lines]`, a long line as
 * `[Pasted text #4 1499 chars]`.
 */
export const box: BoxProfile = {
  read: (screen) => ruledBox(screen, ">"),
  collapsed: ({ text }) => /^\[Pasted text #\d+ (?:\+\d+ lines?|\d+ chars?)\]$/.test(text.trim()),
}
