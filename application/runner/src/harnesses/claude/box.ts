import { ruledBox, type BoxProfile } from "../box.js"

/**
 * Claude Code's input box: between two `─` rules, `❯ ` leading its first row and the rest
 * indented (probed 2.1.287 and 2.1.292, fixtures/input-box.probe.json). It sits at the
 * bottom whatever the turn does above it, a long or multi-line paste grows it upwards, and
 * a paste of ten lines or more shows as `[Pasted text #1 +39 lines]`, and one of about a
 * thousand characters as `[Pasted text #5]`.
 */
export const box: BoxProfile = {
  read: (screen) => ruledBox(screen, "❯"),
  collapsed: ({ text }) => /^\[Pasted text #\d+(?: \+\d+ lines?)?\]$/.test(text.trim()),
}
