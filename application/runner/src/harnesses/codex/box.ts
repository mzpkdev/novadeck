import { markedBox, type BoxProfile } from "../box.js"

/**
 * Codex's input box: no frame, `› ` leading its first row, the rest indented, and the
 * cursor on its last row (probed 0.159.3 and 0.160.1, fixtures/input-box.probe.json).
 * Empty, it shows "Ask Codex to do anything" or another suggestion drawn dim. Its first
 * key changes the welcome screen wholesale, so the box is read from where the cursor is,
 * never against an earlier screen. Pastes of about a thousand characters show as `[Pasted Content 1030 chars]`, however
 * many lines (25 short lines show whole).
 */
export const box: BoxProfile = {
  read: (screen) => markedBox(screen, "›"),
  collapsed: ({ text }) => /^\[Pasted Content \d+ chars?\]$/.test(text.trim()),
}
