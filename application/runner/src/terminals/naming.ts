import { terminalTitle, type TitleSource } from "@novadeck/protocol"

import { shorten, type Work } from "./work.js"

export type { TitleSource }

/**
 * What names a terminal (see docs/agent-messaging.md, "Self-description"), each layer
 * kept on its own so the title follows their precedence: the person's title; the newest
 * an agent gave (by `describe`, or as it opened the terminal), with its terminal's
 * handle; and the summary its own agent described its work with, which `agents()`
 * lists. The first prompt and the default come from the terminal's work and handle.
 */
export type Naming = {
  readonly person: string | null
  readonly agent: { readonly title: string; readonly by: string } | null
  readonly summary: string | null
}

/** A terminal nothing named yet. */
export const unnamed: Naming = { person: null, agent: null, summary: null }

/** How long a title from the person's first prompt is, in characters. */
export const fallbackChars = 48

/** The most a summary holds, in characters (code points), over at most `summaryLines` lines. */
export const summaryChars = 200
export const summaryLines = 2

/** The most a title holds, as `terminalTitle` counts it. */
const titleChars = 200

/** A session's default title for its terminal with this handle: `t3` is "Terminal 03". */
export const defaultTitle = (handle: string): string =>
  `Terminal ${handle.slice(1).padStart(2, "0")}`

// Characters no title or summary keeps: C0 and C1 control characters, and DEL.
// eslint-disable-next-line no-control-regex -- These are the characters it removes.
const control = /[\x00-\x1f\x7f-\x9f]/g
// eslint-disable-next-line no-control-regex -- As above, to test for one.
const hasControl = /[\x00-\x1f\x7f-\x9f]/

/**
 * The title the person's first root prompt gives, shortened to one line; null when there
 * is none, or nothing of it would make a title. Only the person's prompts are kept in
 * `work`, never a doorbell's line or a task delivered to the agent.
 */
export const fallbackTitle = (work: Work | null): string | null => {
  if (!work?.first) return null
  const title = shorten(work.first.replace(control, " "), fallbackChars)
  return terminalTitle.safeParse(title).success ? title : null
}

/**
 * The terminal's title and who it is from, by precedence: the person, then the agent
 * that set it last, then the person's first prompt, then the default. A terminal an
 * agent opened takes no title from a first prompt: its command's, not the person's.
 */
export const titleOf = (
  naming: Naming,
  terminal: {
    readonly work: Work | null
    readonly handle: string
    readonly openedBy: string | null
  },
): { readonly title: string; readonly source: TitleSource } => {
  if (naming.person !== null) return { title: naming.person, source: { kind: "person" } }
  if (naming.agent)
    return { title: naming.agent.title, source: { kind: "agent", by: naming.agent.by } }
  const fallback = terminal.openedBy === null ? fallbackTitle(terminal.work) : null
  if (fallback !== null) return { title: fallback, source: { kind: "fallback" } }
  return { title: defaultTitle(terminal.handle), source: { kind: "default" } }
}

/** The person's title given, or with null taken away, so the title is automatic again. */
export const renamed = (naming: Naming, title: string | null): Naming => ({
  ...naming,
  person: title,
})

/** The title an agent asked for as it opened the terminal: the opener's, never the person's. */
export const openedWith = (naming: Naming, title: string, by: string): Naming => ({
  ...naming,
  agent: { title, by },
})

/**
 * Why a description's title isn't the one shown, or not as the person's: the person gave
 * the terminal its title (`person`), or `asked` wasn't granted (`unasked`), so the title
 * was taken as the agent's own.
 */
export type Kept = "person" | "unasked"

// A title or prompt as compared: one case, one space between words.
const folded = (text: string): string =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()

/**
 * Whether the person gave this title in their own words: the title, folded and with
 * surrounding quotes and punctuation trimmed, is in the prompt that started their turn.
 */
export const givenIn = (title: string, prompt: string | undefined): boolean => {
  if (prompt === undefined) return false
  const wanted = folded(title).replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
  return wanted.length > 0 && folded(prompt).includes(wanted)
}

/**
 * What names the terminal once its agent described it: the title is always the agent's
 * newest, shown unless the person gave one, which stays; with `asked`, it becomes the
 * person's only when their own `prompt`, the one that started their current root turn,
 * gives it (see `givenIn`). The summary is the agent's.
 */
export const describedAs = (
  naming: Naming,
  input: {
    readonly title: string
    readonly summary: string
    readonly by: string
    readonly asked: boolean
    /** The person's prompt that started the current root turn, if it is theirs. */
    readonly prompt: string | undefined
  },
): { readonly naming: Naming; readonly kept?: Kept } => {
  const { title, summary, by, asked } = input
  const granted = asked && givenIn(title, input.prompt)
  const next: Naming = {
    person: granted ? title : naming.person,
    agent: { title, by },
    summary,
  }
  if (asked && !granted) return { naming: next, kept: "unasked" }
  if (!granted && naming.person !== null) return { naming: next, kept: "person" }
  return { naming: next }
}

/** A summary as kept: each line's spaces collapsed, blank lines dropped, control characters removed. */
export const cleanSummary = (summary: string): string =>
  summary
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(control, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")

/**
 * Why a description can't be taken; undefined when it can. The title is one line, as
 * the person's are; the summary one or two lines of up to `summaryChars` characters.
 */
export const descriptionRefusal = (title: string, summary: string): string | undefined => {
  if (!title) return "The title is empty: give the terminal a short title."
  if (hasControl.test(title)) return "The title must be one line, without control characters."
  if (title.length > titleChars)
    return `The title is ${title.length} characters; keep it to ${titleChars}.`
  if (!summary) return "The summary is empty: say in a line or two what you work on."
  const lines = summary.split("\n").length
  const chars = [...summary].length
  if (lines > summaryLines || chars > summaryChars)
    return (
      `The summary is ${chars} characters over ${lines} lines; ` +
      `keep it to ${summaryLines} lines and ${summaryChars} characters.`
    )
  return undefined
}
