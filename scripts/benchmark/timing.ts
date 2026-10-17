// The timing run's report as a pull request comment. Real time on a shared CI machine
// makes these numbers too noisy to gate on, so they are only reported, beside the last
// reading from main when there is one, and kept as a trend.

type Steady = {
  readonly layout: string
  // A percentage of the window's wall time: a saturated main thread reads about 100.
  readonly mainThreadShare?: number | null
  readonly fps?: number | null
  readonly framesOver33ms?: number | null
}

// What `pnpm bench:timing` writes (version 1). Every field is read as optional: a run
// that stopped short still reports what it got.
export type TimingReport = {
  readonly version?: number
  readonly commit?: string
  readonly scenario?: { readonly agents?: number }
  readonly summary?: {
    readonly switchP50Ms?: number | null
    readonly switchP90Ms?: number | null
    readonly switchesTimedOut?: number
    readonly agentsHeard?: number
    readonly steady?: readonly Steady[]
  }
  readonly problems?: readonly unknown[]
  readonly error?: string
}

// Marks the comment so a later run updates it instead of adding another.
export const timingMarker = "<!-- novadeck-benchmark-timing -->"

const ms = (value: number | null | undefined): string =>
  typeof value === "number" ? `${Math.round(value)} ms` : "–"
const share = (value: number | null | undefined): string =>
  typeof value === "number" ? `${Math.round(value)}%` : "–"
const count = (value: number | null | undefined): string =>
  typeof value === "number" ? String(value) : "–"

const steadyOf = (report: TimingReport | undefined, layout: string): Steady | undefined =>
  report?.summary?.steady?.find((entry) => entry.layout === layout)

// What makes a report's numbers less than they seem, each on one line: a run that stopped
// short (its first line; the rest is in the artifact), what the sandbox reported, and
// agents the runner didn't hear.
const warningsOf = (report: TimingReport, whose: string): string[] => {
  const error = report.error?.split("\n")[0]?.trim()
  const heard = report.summary?.agentsHeard
  const agents = report.scenario?.agents
  return [
    ...(error ? [`${whose} stopped short: ${error}`] : []),
    ...(report.problems?.length
      ? [
          `${whose} sandbox reported ${report.problems.length} problem(s): processes it had to reap or writes outside it. Look at the report artifact.`,
        ]
      : []),
    ...(typeof heard === "number" && typeof agents === "number" && heard < agents
      ? [`${whose} runner heard ${heard} of ${agents} fake agents, so less load was measured.`]
      : []),
  ]
}

// One row: this run's value, and main's beside it when known.
const row = (
  name: string,
  value: (report: TimingReport | undefined) => string,
  report: TimingReport,
  main: TimingReport | undefined,
): string => `| ${name} | ${value(report)} |${main ? ` ${value(main)} |` : ""}`

// The report as Markdown, its column headed `label` ("This pull request", "This run"),
// with main's last report beside it when given.
export const timingComment = (
  report: TimingReport,
  { main, label = "This run" }: { readonly main?: TimingReport; readonly label?: string } = {},
): string => {
  const warnings = [
    ...warningsOf(report, "This run"),
    ...(main ? warningsOf(main, "Main's run") : []),
  ]
  const mainColumn = main ? ` Main${main.commit ? ` (${main.commit.slice(0, 7)})` : ""} |` : ""
  const layouts = ["Grid", "Focus"]
  return [
    timingMarker,
    "## Timing run",
    "",
    "Real time on a shared CI machine: reported as a trend, never gated.",
    ...warnings.map((warning) => `\n> ⚠️ ${warning}`),
    "",
    `| Measure | ${label} |${mainColumn}`,
    `| --- | --- |${main ? " --- |" : ""}`,
    row("Switch p90", (entry) => ms(entry?.summary?.switchP90Ms), report, main),
    row("Switch p50", (entry) => ms(entry?.summary?.switchP50Ms), report, main),
    row(
      "Switches with no paint in 4 s",
      (entry) => count(entry?.summary?.switchesTimedOut),
      report,
      main,
    ),
    ...layouts.flatMap((layout) => [
      row(
        `${layout} main-thread share`,
        (entry) => share(steadyOf(entry, layout)?.mainThreadShare),
        report,
        main,
      ),
      row(
        `${layout} frames over 33 ms`,
        (entry) => count(steadyOf(entry, layout)?.framesOver33ms),
        report,
        main,
      ),
    ]),
    row("Agents heard", (entry) => count(entry?.summary?.agentsHeard), report, main),
    "",
  ].join("\n")
}
