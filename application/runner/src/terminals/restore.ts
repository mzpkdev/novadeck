import { findLine } from "./ring.js"

/** The text without its whitespace, as a TUI may wrap and indent it anywhere. */
const compact = (text: string): string => text.replace(/\s+/g, "")

/** The widest a box's prompt marker is, in characters: `❯`, `>`, `›`. */
const markerChars = 2

/**
 * Whether Escape put the interrupted turn's `prompt` back in the agent's input box (Claude
 * Code does, when no reply came yet): it shows now once and alone, as the box's whole
 * content, behind nothing but its prompt marker, and in a place it did not show before,
 * where only the turn's echo above the box did. Text the person added beside it, or a
 * draft it was merged with, fails the test, so what a clear would remove is never theirs.
 */
export const restoredDraft = (
  before: readonly string[],
  after: readonly string[],
  prompt: string,
): boolean => {
  const needle = compact(prompt)
  if (!needle) return false
  const found = findLine(after, prompt)
  if (found.length !== 1) return false
  const { first, last, column } = found[0]!
  if (findLine(before, prompt).some((was) => was.first === first)) return false
  const lead = compact(after[first]!.slice(0, column))
  if ([...lead].length > markerChars) return false
  // The rows it spans hold the marker and the text and nothing else.
  return compact(after.slice(first, last + 1).join("")) === lead + needle
}
