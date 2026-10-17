import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"

import { timingComment, type TimingReport } from "./timing.ts"

const read = (path: string): TimingReport => JSON.parse(readFileSync(path, "utf8")) as TimingReport

// `node scripts/benchmark/timing-main.ts <report> [main's report] [comment file]`: the
// timing run's report as Markdown, beside main's last one when given, in the job summary
// and, for a pull request, in the file its comment step posts. It never fails on the
// numbers: they are a trend, not a gate.
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
  const comment = timingComment(
    report,
    mainPath && existsSync(mainPath) ? read(mainPath) : undefined,
  )
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
