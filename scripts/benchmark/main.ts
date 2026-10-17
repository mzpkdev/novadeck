import { appendFileSync, existsSync, readFileSync } from "node:fs"

import {
  budgetChanges,
  checkCounters,
  countersSummary,
  type Budgets,
  type Reading,
} from "./counters.ts"

const readingPath = "application/ui/test-results/counters.json"
const budgetsPath = "application/ui/src/specs/counters/budgets.json"

// `node scripts/benchmark/main.ts [base budgets]`: checks the counter run's reading against
// its budgets, and the budgets against the base branch's when given; writes the summary to
// the job's, and fails on a count past its budget or a raise that doesn't say why.
export const main = (basePath = process.argv[2]): void => {
  const reading = JSON.parse(readFileSync(readingPath, "utf8")) as Reading
  const budgets = JSON.parse(readFileSync(budgetsPath, "utf8")) as Budgets
  const base =
    basePath && existsSync(basePath)
      ? (JSON.parse(readFileSync(basePath, "utf8")) as Budgets)
      : undefined
  const rows = checkCounters(reading, budgets)
  const changes = base ? budgetChanges(budgets, base) : []
  const summary = countersSummary(reading, rows, changes)
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  const over = rows.filter((row) => row.verdict === "over")
  for (const { phase, counter, value, budget } of over)
    console.error(
      `::error title=Counter past budget::${phase} ${counter} is ${value}, over its budget of ${budget}.`,
    )
  const unexplained = changes.filter((change) => change.problem)
  for (const { phase, counter, from, to } of unexplained)
    console.error(
      `::error title=Budget raised without a reason::${phase} ${counter} went from ${from} to ${to}; say why and where from.`,
    )
  process.exitCode = over.length || unexplained.length ? 1 : 0
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
