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

// Whether `title` copies `example`: all of the example's words, and nothing else (whatever
// the case), or, when `source` is given, nearly so with words that nothing in the digest
// says. A title of real work that happens to share words with an example stays.
const copies = (title: string, example: string, source: string | undefined): boolean => {
  const a = new Set(words(title))
  const b = new Set(words(example))
  const shared = [...a].filter((word) => b.has(word)).length
  if (shared === a.size && shared === b.size) return source === undefined || !present(a, source)
  if (source === undefined) return false
  return shared / new Set([...a, ...b]).size >= 0.75 && !present(a, source)
}

// Whether every word is somewhere in `source`, the lower-cased text the model was shown.
const present = (given: ReadonlySet<string>, source: string): boolean =>
  [...given].every((word) => source.includes(word))

// What a person says to an agent: the whole title being one of these names no work.
const chat = new Set(
  [
    "hi",
    "hey",
    "hello",
    "thanks",
    "thank you",
    "ok",
    "okay",
    "yes",
    "sure",
    "try again",
    "continue",
    "keep going",
    "go on",
    "go ahead",
    "do it",
    "hows it going",
    "hows going",
    "whats up",
    "how are you",
    "okay sounds good",
    "say hi",
  ].flatMap((phrase) => [
    phrase,
    ...["there", "please", "again", "now"].map((x) => `${phrase} ${x}`),
  ]),
)

// Scripts written without spaces: a title in one counts its characters, not its words.
const spaceless =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u
export const spacelessCharacters = { min: 2, max: 16 }

const tidy = (text: string): string => text.replace(/\s+/g, " ").trim()

// Markdown the model sometimes wraps its words in; a terminal title shows it literally.
const plain = (text: string): string =>
  tidy(text.replace(/[*_`#]+/g, " ").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, ""))

/**
 * The title in `raw`, the model's reply, or undefined when it can't be used. `source` is
 * the text the model was shown, which tells a title that copies an example from one that
 * names the same work.
 */
export const parseDescription = (raw: string, source?: string): Description | undefined => {
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
  if (cleanTitle.length > titleCharacters) return undefined
  if (spaceless.test(cleanTitle)) {
    const characters = [...cleanTitle.replaceAll(/\s/g, "")].length
    if (characters < spacelessCharacters.min || characters > spacelessCharacters.max)
      return undefined
  } else {
    const count = cleanTitle === "" ? 0 : cleanTitle.split(" ").length
    if (count < titleWords.min || count > titleWords.max) return undefined
  }
  // A question, or a greeting or request echoed back, names nothing.
  if (cleanTitle.endsWith("?")) return undefined
  if (chat.has(words(cleanTitle).join(" "))) return undefined
  const shown = source?.toLowerCase()
  if (exampleTitles.some((example) => copies(cleanTitle, example, shown))) return undefined
  return { title: cleanTitle }
}
