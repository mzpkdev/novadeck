// What the model writes is a guess in JSON. This keeps the guesses that fit a terminal's
// title bar and sidebar, tidies them, and drops the rest, so nothing downstream checks again.
import type { Description } from "./describer.js"

export const titleWords = { min: 2, max: 6 }
export const titleCharacters = 48
export const summaryCharacters = 200
export const summarySentences = 2

const tidy = (text: string): string => text.replace(/\s+/g, " ").trim()

// Markdown the model sometimes wraps its words in; a terminal title shows it literally.
const plain = (text: string): string =>
  tidy(text.replace(/[*_`#]+/g, " ").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, ""))

const sentences = (text: string): string[] => text.split(/(?<=[.!?…])\s+(?=\S)/)

/** The title and summary in `raw`, the model's reply, or undefined when it can't be used. */
export const parseDescription = (raw: string): Description | undefined => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof value !== "object" || value === null) return undefined
  const { title, summary } = value as Record<string, unknown>
  if (typeof title !== "string" || typeof summary !== "string") return undefined

  const cleanTitle = plain(title).replace(/[.:;,\s]+$/, "")
  const words = cleanTitle === "" ? 0 : cleanTitle.split(" ").length
  if (words < titleWords.min || words > titleWords.max) return undefined
  if (cleanTitle.length > titleCharacters) return undefined

  // A third sentence is the model rambling: cut it rather than lose the first two.
  const cleanSummary = sentences(plain(summary)).slice(0, summarySentences).join(" ")
  if (cleanSummary === "" || cleanSummary.length > summaryCharacters) return undefined
  return { title: cleanTitle, summary: cleanSummary }
}
