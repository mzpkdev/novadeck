/**
 * The person's input to a terminal as keys, for messaging to tell what reached the agent's
 * input box (see docs/agent-messaging.md, "What counts"). It errs toward a draft: only a
 * bare Enter submits.
 */
export type Key =
  /** A bare Enter: a carriage return of its own, not Alt or Shift+Enter, nor in a paste. */
  | { readonly kind: "enter" }
  /** A key that moves within a menu or a box: an arrow, Home or End, Tab. */
  | { readonly kind: "navigation"; readonly text: string }
  /** Anything else: text typed or pasted, Escape, Backspace, a newline in the box. */
  | { readonly kind: "other"; readonly text: string }

// A CSI or SS3 sequence's final byte, after its parameters.
// eslint-disable-next-line no-control-regex -- Escape sequences are what it reads.
const csi = /^\x1b(?:\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|O[\x40-\x7e])/
// The cursor keys, Home and End, and the keypad's, which move without typing.
// eslint-disable-next-line no-control-regex -- As above.
const moves = /^\x1b(?:\[[\d;]*[ABCDFH]|O[ABCDFH]|\[[1478]~)$/

/**
 * The keys in one write. A bracketed paste is one key, whatever it holds, so its carriage
 * returns never submit; `queueKey` (Codex's Tab) is a bare Enter's kind of submission too.
 */
export const keysOf = (data: string, queueKey?: string): readonly Key[] => {
  const keys: Key[] = []
  let at = 0
  while (at < data.length) {
    const rest = data.slice(at)
    if (rest.startsWith("\x1b[200~")) {
      const end = rest.indexOf("\x1b[201~")
      const length = end < 0 ? rest.length : end + 6
      keys.push({ kind: "other", text: rest.slice(0, length) })
      at += length
      continue
    }
    const sequence = csi.exec(rest)?.[0]
    if (sequence) {
      keys.push({ kind: moves.test(sequence) ? "navigation" : "other", text: sequence })
      at += sequence.length
      continue
    }
    // Escape with the next key is Alt (or a TUI's Shift+Enter): never a bare key.
    if (rest[0] === "\x1b") {
      const length = rest.length > 1 ? 2 : 1
      keys.push({ kind: "other", text: rest.slice(0, length) })
      at += length
      continue
    }
    if (rest[0] === "\r") {
      keys.push({ kind: "enter" })
      at += 1
      continue
    }
    if (queueKey && rest.startsWith(queueKey)) {
      keys.push({ kind: "enter" })
      at += queueKey.length
      continue
    }
    if (rest[0] === "\t") {
      keys.push({ kind: "navigation", text: "\t" })
      at += 1
      continue
    }
    keys.push({ kind: "other", text: rest[0]! })
    at += 1
  }
  return keys
}

/**
 * What the person's keys did, for messaging: each part `answers` a request waiting on
 * them, or is input to the box, which `submits` only as a bare Enter. While a request is
 * still to be answered, the keys up to and including its first answering key (Enter,
 * Escape, or one key that types) answer it, and the moves before it navigate; whatever
 * follows is a draft.
 */
export const inputParts = (
  keys: readonly Key[],
  answering: boolean,
): readonly { readonly submits: boolean; readonly answers: boolean }[] => {
  const parts: { submits: boolean; answers: boolean }[] = []
  let open = answering
  for (const key of keys) {
    if (open) {
      parts.push({ submits: false, answers: true })
      if (key.kind !== "navigation") open = false
      continue
    }
    parts.push({ submits: key.kind === "enter", answers: false })
  }
  return parts
}
