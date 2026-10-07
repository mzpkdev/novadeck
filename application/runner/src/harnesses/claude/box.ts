import { ruledBox, type BoxProfile } from "../box.js"

/**
 * Claude Code's input box: between two `─` rules, `❯ ` leading its first row and the rest
 * indented (probed 2.1.287 and 2.1.292, fixtures/input-box.probe.json). It sits at the
 * bottom whatever the turn does above it, a long or multi-line paste grows it upwards, and
 * a paste of more than three lines shows as `[Pasted text #1 +39 lines]`, and one of more
 * than about 800 characters (800 showed, 900 did not) as `[Pasted text #5]`. Below the
 * box it keeps two rules' worth and a footer row or two.
 */
export const box: BoxProfile = {
  read: (screen) => ruledBox(screen, "❯"),
  collapsed: ({ text }) => /^\[Pasted text #\d+(?: \+\d+ lines?)?\]$/.test(text.trim()),
  collapses: (text) => text.split("\n").length > 3 || text.length > 900,
  room: (rows) => rows - 4,
}
