import { shorten } from "./work.js"

/**
 * When NovaDeck nudges a terminal's agent to describe its work (see
 * docs/agent-messaging.md, "Self-description"): a new root session; a compaction, where
 * the harness reports one; the work drifting from where it was at the last `describe`
 * (its plan's title, the folder it writes in most, or its branch); and, as a backstop,
 * `backstopPrompts` of the person's prompts since the last `describe`.
 */
export type Trigger = "session" | "compaction" | "drift" | "prompts"

/** What drift is told by: the terminal's plan title, its main "works in" folder, its branch. */
export type Facts = {
  readonly plan: string | null
  readonly folder: string | null
  readonly branch: string | null
}

/**
 * A terminal's nudges: the triggers that fired since the last `describe` or nudge, the
 * person's prompts counted toward the backstop, and the facts drift is measured from
 * (those at the last `describe`, or at the drift last nudged for); null before any
 * `describe`.
 */
export type Nudges = {
  readonly pending: readonly Trigger[]
  readonly prompts: number
  readonly baseline: Facts | null
}

/** How many of the person's prompts since the last `describe` nudge as a backstop. */
export const backstopPrompts = 15

export const noNudges: Nudges = { pending: [], prompts: 0, baseline: null }

/** A trigger fired; it nudges once, at the next prompt that carries nothing else. */
export const fired = (nudges: Nudges, trigger: Trigger): Nudges =>
  nudges.pending.includes(trigger) ? nudges : { ...nudges, pending: [...nudges.pending, trigger] }

/** The person prompted: one more toward the backstop, which fires every `backstopPrompts`. */
export const personPrompted = (nudges: Nudges): Nudges => {
  const prompts = nudges.prompts + 1
  if (prompts < backstopPrompts) return { ...nudges, prompts }
  return fired({ ...nudges, prompts: 0 }, "prompts")
}

const same = (a: Facts, b: Facts): boolean =>
  a.plan === b.plan && a.folder === b.folder && a.branch === b.branch

/**
 * The facts as they stand: drift fires once they differ from the baseline, which then
 * moves to them, so the same drift never fires again. Nothing drifts before a `describe`.
 */
export const drifted = (nudges: Nudges, facts: Facts): Nudges => {
  if (!nudges.baseline || same(nudges.baseline, facts)) return nudges
  return fired({ ...nudges, baseline: facts }, "drift")
}

/** The agent described its work: nothing is pending, and drift is measured from `facts`. */
export const described = (facts: Facts): Nudges => ({ pending: [], prompts: 0, baseline: facts })

/**
 * Whether a prompt's answer nudges, and the nudges after it: only when a trigger fired,
 * and never in an answer that carries anything else, as messages, when the triggers wait.
 */
export const take = (
  nudges: Nudges,
  quiet: boolean,
): { readonly nudge: boolean; readonly nudges: Nudges } =>
  quiet && nudges.pending.length > 0
    ? { nudge: true, nudges: { ...nudges, pending: [] } }
    : { nudge: false, nudges }

/**
 * The nudge, one line worded as NovaDeck's automatic notice: asking for a description
 * while there is none, else showing the current one, to update only if it no longer fits.
 */
export const nudgeText = (current: { readonly title: string; readonly summary: string | null }) =>
  current.summary === null
    ? "NovaDeck: automatic notice, not from the user: this terminal has no description yet. " +
      "When it suits, call NovaDeck's describe tool with a short title and a line or two on " +
      "what you work on here, so the user and other agents can tell terminals apart; this " +
      "notice needs no reply."
    : `NovaDeck: automatic notice, not from the user: this terminal is described as ` +
      `${JSON.stringify(shorten(current.title, 200))}, with the summary ` +
      `${JSON.stringify(shorten(current.summary, 200))}; ` +
      "if that no longer fits your work, update it with NovaDeck's describe tool, and " +
      "otherwise this notice can be ignored."
