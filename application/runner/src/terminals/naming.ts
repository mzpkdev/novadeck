import { terminalTitle } from "@novadeck/protocol"

import { shorten, type Work } from "./work.js"

/**
 * Who a terminal's title is from (see docs/agent-messaging.md, "Self-description"): the
 * person; an agent, by its terminal's handle (the agent that opened it with a title, or
 * its own through `describe`); the person's first prompt of its root session, shortened
 * (`fallback`); or its session's `default`, "Terminal 03".
 */
export type TitleSource =
  | { readonly kind: "person" }
  | { readonly kind: "agent"; readonly by: string }
  | { readonly kind: "fallback" }
  | { readonly kind: "default" }

/**
 * What names a terminal, each layer kept on its own so the title follows their
 * precedence: the person's title; the latest an agent gave (by `describe`, or as it
 * opened the terminal), with its terminal's handle; and the summary its own agent
 * described its work with, which `agents()` lists. The first prompt and the default come
 * from the terminal's work and handle.
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

/** The most a summary holds, in characters, over at most `summaryLines` lines. */
export const summaryChars = 200
export const summaryLines = 2

/** A session's default title for its terminal with this handle: `t3` is "Terminal 03". */
export const defaultTitle = (handle: string): string =>
  `Terminal ${handle.slice(1).padStart(2, "0")}`

// Characters no title holds: control characters, as `terminalTitle` refuses them.
// eslint-disable-next-line no-control-regex -- These are the characters it removes.
const control = /[\x00-\x1f\x7f]/g

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
 * that set it last, then the person's first prompt, then the default.
 */
export const titleOf = (
  naming: Naming,
  work: Work | null,
  handle: string,
): { readonly title: string; readonly source: TitleSource } => {
  if (naming.person !== null) return { title: naming.person, source: { kind: "person" } }
  if (naming.agent)
    return { title: naming.agent.title, source: { kind: "agent", by: naming.agent.by } }
  const fallback = fallbackTitle(work)
  if (fallback !== null) return { title: fallback, source: { kind: "fallback" } }
  return { title: defaultTitle(handle), source: { kind: "default" } }
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
 * the person's are; the summary one or two lines of up to `summaryChars`.
 */
export const descriptionRefusal = (title: string, summary: string): string | undefined => {
  if (!terminalTitle.safeParse(title).success)
    return "The title must be one line of 1 to 200 characters, without control characters."
  if (!summary) return "The summary is empty: say in a line or two what you work on."
  if (summary.split("\n").length > summaryLines || summary.length > summaryChars)
    return (
      `The summary is ${summary.length} characters over ${summary.split("\n").length} lines; ` +
      `keep it to ${summaryLines} lines and ${summaryChars} characters.`
    )
  return undefined
}
