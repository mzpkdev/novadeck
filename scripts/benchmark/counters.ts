// The counter run's reading against its budgets. The run gives the same counts every
// time, so a count past its budget is a regression, never noise: the gate fails on it.
// Commits and component renders are framework cost, reported beside them, never gated.
// Work that really costs more may raise a budget in the same pull request, saying why and
// where the cost comes from; every changed budget shows in the summary, old to new.

export const phases = ["grid", "focus", "switches"] as const
export const gated = [
  "notifications",
  "mutations",
  "bytes",
  "streamingPeak",
  "streamingSettled",
] as const
const reported = ["commits", "renders"] as const

type Phase = (typeof phases)[number]
type Gated = (typeof gated)[number]
type Tick = Record<"notifications" | "mutations" | (typeof reported)[number], number>

// What application/ui/src/specs/counters/ leaves in test-results/counters.json.
export type PhaseReading = {
  readonly ticks: number
  readonly tickTotals: Tick
  readonly bytes: number
  readonly written: number
  readonly streamingPeak: number
  readonly streamingSettled: number
}
export type Reading = Readonly<Record<Phase, PhaseReading>>
// A counter's budget: a count, or a raised one with why it was raised and the pull request
// or commit it came from.
export type Budget =
  | number
  | { readonly budget: number; readonly reason: string; readonly from: string }
// The budget file: each phase's gated counts, and notes for the reader.
export type Budgets = Readonly<Record<Phase, Readonly<Record<Gated, Budget>>>> & {
  readonly notes?: readonly string[]
}

const budgetOf = (budget: Budget | undefined): number | undefined =>
  typeof budget === "object" ? budget.budget : budget

export type Verdict = "over" | "under" | "within"
export type Row = {
  readonly phase: Phase
  readonly counter: Gated
  readonly value: number
  readonly budget: number
  readonly verdict: Verdict
}

// The gated values of a phase: per-tick counts as totals over its fixed number of ticks.
const gatedValues = (phase: PhaseReading): Record<Gated, number> => ({
  notifications: phase.tickTotals.notifications,
  mutations: phase.tickTotals.mutations,
  bytes: phase.bytes,
  streamingPeak: phase.streamingPeak,
  streamingSettled: phase.streamingSettled,
})

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0

// Every gated count of every phase beside its budget. A reading or budget file that lacks
// one is an error: a counter the gate can't see must not pass as within budget.
export const checkCounters = (reading: Reading, budgets: Budgets): Row[] =>
  phases.flatMap((phase) => {
    if (!reading[phase]) throw new Error(`The reading has no ${phase} phase.`)
    const values = gatedValues(reading[phase])
    return gated.map((counter) => {
      const value = values[counter]
      const budget = budgetOf(budgets[phase]?.[counter])
      if (!isCount(value)) throw new Error(`The reading has no count for ${phase} ${counter}.`)
      if (!isCount(budget)) throw new Error(`No budget is set for ${phase} ${counter}.`)
      const verdict: Verdict = value > budget ? "over" : value < budget ? "under" : "within"
      return { phase, counter, value, budget, verdict }
    })
  })

export type BudgetChange = {
  readonly phase: Phase
  readonly counter: Gated
  readonly from: number
  readonly to: number
  readonly reason?: string
  readonly source?: string
  // Why the change can't stand: a raise that doesn't say why or where it came from.
  readonly problem?: string
}

const said = (text: unknown): text is string => typeof text === "string" && text.trim() !== ""

// Every budget this change moves against the base branch's. A raise must say why and the
// pull request or commit it came from; a cut needs neither.
export const budgetChanges = (budgets: Budgets, base: Budgets): BudgetChange[] =>
  phases.flatMap((phase) =>
    gated.flatMap((counter) => {
      const entry = budgets[phase]?.[counter]
      const to = budgetOf(entry)
      const from = budgetOf(base[phase]?.[counter])
      if (!isCount(to) || !isCount(from) || to === from) return []
      if (to < from) return [{ phase, counter, from, to }]
      const why = typeof entry === "object" ? entry : undefined
      const reason = said(why?.reason) ? why.reason : undefined
      const source = said(why?.from) ? why.from : undefined
      return [
        {
          phase,
          counter,
          from,
          to,
          ...(reason ? { reason } : {}),
          ...(source ? { source } : {}),
          ...(reason && source
            ? {}
            : {
                problem:
                  'A raised budget is written { "budget": n, "reason": "why", "from": "#PR or commit" }.',
              }),
        },
      ]
    }),
  )

const perTick = (total: number, ticks: number): string => (ticks ? (total / ticks).toFixed(1) : "–")

const mark: Record<Verdict, string> = { over: "❌ over", under: "⬇️ under", within: "✅" }

// The reading as Markdown, for the job summary: the gated counts against their budgets,
// then the framework cost per tick.
export const countersSummary = (
  reading: Reading,
  rows: readonly Row[],
  changes: readonly BudgetChange[] = [],
): string => {
  const gatedRows = rows.map(({ phase, counter, value, budget, verdict }) => {
    const tick = counter === "notifications" || counter === "mutations"
    const ticks = reading[phase].ticks
    const shown = tick ? `${value} (${perTick(value, ticks)}/tick)` : String(value)
    return `| ${phase} | ${counter} | ${shown} | ${budget} | ${mark[verdict]} |`
  })
  const costRows = phases.map((phase) => {
    const { ticks, tickTotals } = reading[phase]
    return `| ${phase} | ${ticks} | ${perTick(tickTotals.commits, ticks)} | ${perTick(tickTotals.renders, ticks)} |`
  })
  const over = rows.filter((row) => row.verdict === "over")
  const under = rows.filter((row) => row.verdict === "under")
  const changeRows = changes.map(
    ({ phase, counter, from, to, reason, source, problem }) =>
      `| ${phase} | ${counter} | ${from} → ${to} | ${problem ? `❌ ${problem}` : (reason ?? "lowered")} | ${source ?? ""} |`,
  )
  return [
    "## Counter run",
    "",
    ...(changes.length
      ? [
          "This pull request changes budgets:",
          "",
          "| Phase | Counter | Budget | Why | From |",
          "| --- | --- | --- | --- | --- |",
          ...changeRows,
          "",
        ]
      : []),
    over.length
      ? `${over.length} counter(s) past budget. Fix the regression, or raise the budget in application/ui/src/specs/counters/budgets.json and say why in the pull request.`
      : under.length
        ? `Every counter within budget; ${under.length} now under it: lower the budget in application/ui/src/specs/counters/budgets.json to lock the gain in.`
        : "Every counter within budget.",
    "",
    "| Phase | Counter | Count | Budget | |",
    "| --- | --- | --- | --- | --- |",
    ...gatedRows,
    "",
    "Framework cost per tick (reported, not gated):",
    "",
    "| Phase | Ticks | React commits | Component renders |",
    "| --- | --- | --- | --- |",
    ...costRows,
    "",
  ].join("\n")
}
