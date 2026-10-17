import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"

import { timingComment, type TimingReport } from "./timing.ts"

const read = (path: string): TimingReport => {
  const report: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (typeof report !== "object" || report === null) throw new Error(`${path} is not a report.`)
  return report as TimingReport
}

// Main's last report, if one is there and reads; one that doesn't is noted and left out,
// as it says nothing about this run.
const readMain = (path: string | undefined): TimingReport | undefined => {
  if (!path || !existsSync(path)) return undefined
  try {
    return read(path)
  } catch (error) {
    console.error(
      `::warning title=Main's timing report unread::${String(error).split("\n")[0]}; reported without it.`,
    )
    return undefined
  }
}

// `node scripts/benchmark/timing-main.ts <report> [main's report] [comment file]`: the
// timing run's report as Markdown, beside main's last one when given, in the job summary
// and, for a pull request, in the file its comment step posts. It never fails on the
// numbers, a trend and not a gate; only on this run's report missing or not reading.
export const main = (
  reportPath = process.argv[2],
  mainPath = process.argv[3],
  commentPath = process.argv[4],
): void => {
  if (!reportPath || !existsSync(reportPath)) {
    console.error(`::error title=No timing report::${reportPath ?? "(none given)"} is missing.`)
    process.exitCode = 1
    return
  }
  const report = read(reportPath)
  if (report.version !== 1)
    console.error(
      `::warning title=Unknown timing report::It says version ${String(report.version)}; this reads version 1.`,
    )
  const mainReport = readMain(mainPath)
  const label = commentPath ? "This pull request" : "This run"
  const comment = timingComment(report, { ...(mainReport ? { main: mainReport } : {}), label })
  console.log(comment)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, comment)
  if (commentPath) writeFileSync(commentPath, comment)
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
