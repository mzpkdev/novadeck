// What the model writes is a guess in JSON. This keeps the guesses that fit a terminal's
// title bar, tidies them, and drops the rest, so nothing downstream checks again.
import type { Description } from "./describer.js"

export const titleWords = { min: 2, max: 6 }
export const titleCharacters = 48

/**
 * The titles the prompt shows as examples. A small model copies them onto terminals they
 * don't fit, so a title that is one of them is refused.
 */
export const exampleTitles = [
  "Rotating billing webhook keys",
  "Walidacja formularza rejestracji",
  "Awaria testów",
  "Following the nginx access log",
] as const

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)

// Whether `title` is `example`, or all but a word, whatever the case.
const copies = (title: string, example: string): boolean => {
  const a = new Set(words(title))
  const b = new Set(words(example))
  const shared = [...a].filter((word) => b.has(word)).length
  return shared / new Set([...a, ...b]).size >= 0.75
}

// What a person says to an agent, which is not a name for the work.
const chat =
  /^(hi|hey|hello|thanks|thank you|ok|okay|yes|sure|try again|continue|keep going|go on|go ahead|do it|hows? (it )?going|whats up|how are you)\b/

const tidy = (text: string): string => text.replace(/\s+/g, " ").trim()

// Markdown the model sometimes wraps its words in; a terminal title shows it literally.
const plain = (text: string): string =>
  tidy(text.replace(/[*_`#]+/g, " ").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, ""))

/** The title in `raw`, the model's reply, or undefined when it can't be used. */
export const parseDescription = (raw: string): Description | undefined => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof value !== "object" || value === null) return undefined
  const { title } = value as Record<string, unknown>
  if (typeof title !== "string") return undefined

  const cleanTitle = plain(title).replace(/[.:;,\s]+$/, "")
  const count = cleanTitle === "" ? 0 : cleanTitle.split(" ").length
  if (count < titleWords.min || count > titleWords.max) return undefined
  if (cleanTitle.length > titleCharacters) return undefined
  // A question, or a greeting or request echoed back, names nothing.
  if (cleanTitle.endsWith("?")) return undefined
  if (words(cleanTitle).length <= 4 && chat.test(words(cleanTitle).join(" "))) return undefined
  if (exampleTitles.some((example) => copies(cleanTitle, example))) return undefined
  return { title: cleanTitle }
}
