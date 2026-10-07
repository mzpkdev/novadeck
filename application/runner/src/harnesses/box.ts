import type { ScreenText } from "../terminals/doorbell.js"

/**
 * What a harness's input box holds, as its adapter reads it off the screen. Only a
 * harness knows how its box is drawn; prompts only ask what it holds (see
 * `terminals/prompts.ts`).
 */
export type InputBox = {
  /**
   * What the box holds, one line per row, with its prompt marker and indent taken off;
   * empty for an empty box, whatever faint suggestion it shows.
   */
  readonly text: string
  /** The rows of the screen it spans, first to last. */
  readonly first: number
  readonly last: number
}

/** How a harness's input box reads off a screen; undefined where the screen shows none. */
export type BoxReader = (screen: ScreenText) => InputBox | undefined

/** How a harness draws its input box, as its adapter knows it. */
export type BoxProfile = {
  readonly read: BoxReader
  /**
   * Whether the box holds nothing but the placeholder the harness shows for a long paste
   * (Claude Code's `[Pasted text #1 +39 lines]`), which stands for the pasted text.
   */
  readonly collapsed: (box: InputBox) => boolean
}

/** Text without its whitespace, as a TUI may wrap and indent it anywhere. */
export const compact = (text: string): string => text.replace(/\s+/g, "")

/** Whether the box holds nothing. */
export const isEmpty = (box: InputBox): boolean => compact(box.text) === ""

/**
 * The text of the rows `first` to `last`, whose first row starts with `marker`: the rows
 * as drawn undimmed, as a faint placeholder suggestion is not the person's. Faint text is
 * still taken for content where the cursor is not right behind the marker, as a box with
 * text in it has it elsewhere. Undefined where the first row does not start with the marker.
 */
const read = (
  screen: ScreenText,
  first: number,
  last: number,
  marker: string,
): InputBox | undefined => {
  const rows = screen.rows.slice(first, last + 1)
  if (!rows[0]?.startsWith(marker)) return undefined
  const lit = (screen.bright ?? screen.rows).slice(first, last + 1)
  const lines = (shown: readonly string[]): string =>
    shown
      .map((row, index) => (index === 0 ? row.slice(marker.length) : row).replace(/^ {1,2}/, ""))
      .join("\n")
      .trimEnd()
  const text = lines(lit)
  if (compact(text) !== "") return { text, first, last }
  const faint = lines(rows)
  const home = screen.cursor?.row === first && screen.cursor.column <= marker.length + 1
  return { text: compact(faint) === "" || home ? "" : faint, first, last }
}

/** Whether a row is a horizontal rule. */
const rule = (row: string | undefined): boolean => /^─{8,}$/.test((row ?? "").trim())

/**
 * A box drawn between two horizontal rules, its first row led by `marker` (Claude Code's
 * `❯`, Antigravity's `>`): the lowest pair of rules on the screen, the cursor between them.
 * History above it, a spinner, and the footer below do not matter.
 */
export const ruledBox = (screen: ScreenText, marker: string): InputBox | undefined => {
  const bottom = screen.rows.findLastIndex(rule)
  if (bottom < 0) return undefined
  const top = screen.rows.slice(0, bottom).findLastIndex(rule)
  if (top < 0 || bottom - top < 2) return undefined
  const box = read(screen, top + 1, bottom - 1, marker)
  const { cursor } = screen
  return box && (!cursor || (cursor.row > top && cursor.row < bottom)) ? box : undefined
}

/**
 * A box drawn with no frame (Codex's), its first row led by `marker` and its last the
 * cursor's row: rows indented under the marker go up from the cursor to it. The history
 * above is no part of it: it ends at the nearest row led by the marker.
 */
export const markedBox = (screen: ScreenText, marker: string): InputBox | undefined => {
  const { cursor } = screen
  if (!cursor) return undefined
  let first = cursor.row
  for (; first >= 0; first -= 1) {
    const row = screen.rows[first] ?? ""
    if (row.startsWith(marker)) break
    // The body is indented under the marker; a blank line may lie inside it, but the
    // cursor's own row holds text, or the cursor is elsewhere.
    const body = /^ {2}\S/.test(row) || (row.trim() === "" && first !== cursor.row)
    if (!body) return undefined
  }
  return first >= 0 ? read(screen, first, cursor.row, marker) : undefined
}
