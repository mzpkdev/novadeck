/**
 * A rough account of the line the person is typing at a shell's prompt, kept from the keys
 * sent to it, so that an Enter on a line with nothing on it (after Ctrl+L, a line typed and
 * erased, a press on an empty prompt) is not taken for a command. The shell owns the line;
 * this only counts, and says "unknown" where keys may bring text in that it cannot see.
 */
export type Line = {
  /** How many characters are on the line, as far as the keys tell; never below 0. */
  readonly length: number
  /** The keys may have brought text in (history, search, completion, a paste): it counts as typed. */
  readonly unknown: boolean
}

export const emptyLine: Line = { length: 0, unknown: false }

// An escape sequence: CSI (arrows, bracketed paste marks, function keys) or SS3 (application
// arrows), whole, so none of its characters is counted as typed.
// eslint-disable-next-line no-control-regex -- Escape sequences, whole.
const escapes = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001bO[@-~]/y

/**
 * The line after `data` was sent, and whether an Enter in it entered a line that had
 * something on it (the count above 0, or unknown). Backspace and DEL remove a character;
 * Ctrl+U, Ctrl+C and Ctrl+W empty the line (Ctrl+W removes a word, taken for all);
 * Ctrl+L changes nothing; ↑ and ↓ (history), Ctrl+R, Tab and a bracketed paste make it
 * unknown; any other printable character adds one.
 */
export const afterKeys = (line: Line, data: string): { line: Line; entered: boolean } => {
  let { length, unknown } = line
  let entered = false
  let at = 0
  while (at < data.length) {
    if (data[at] === "\u001b") {
      escapes.lastIndex = at
      const match = escapes.exec(data)
      if (!match) {
        // A lone Escape, or Alt with a key: nothing on the line changes.
        at += 1
        continue
      }
      const sequence = match[0]
      const final = sequence.at(-1)
      if (final === "A" || final === "B" || sequence === "\u001b[200~") unknown = true
      at += sequence.length
      continue
    }
    const char = data[at]!
    at += 1
    if (char === "\r" || char === "\n") {
      if (length > 0 || unknown) entered = true
      length = 0
      unknown = false
    } else if (char === "\u007f" || char === "\b") length = Math.max(0, length - 1)
    else if (char === "\u0015" || char === "\u0003" || char === "\u0017") {
      length = 0
      unknown = false
    } else if (char === "\u0012" || char === "\t") unknown = true
    else if (char >= " ") length += 1
  }
  return { line: { length, unknown }, entered }
}
