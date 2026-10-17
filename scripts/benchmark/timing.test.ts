import { context, describe, expect, it } from "../test"
import { timingComment, timingMarker, type TimingReport } from "./timing"

// A report as `pnpm bench:timing` writes it: shares are percentages of wall time.
const report: TimingReport = {
  version: 1,
  commit: "0123456789abcdef",
  scenario: { agents: 5 },
  summary: {
    switchP50Ms: 21.4,
    switchP90Ms: 35.2,
    switchesTimedOut: 0,
    agentsHeard: 5,
    steady: [
      { layout: "Focus", mainThreadShare: 22, fps: 60, framesOver33ms: 1 },
      { layout: "Grid", mainThreadShare: 91.3, fps: 32, framesOver33ms: 40 },
    ],
  },
  problems: [],
}

describe("the timing run's comment", () => {
  it("is marked, so a later run updates it in place", () => {
    expect(timingComment(report).startsWith(timingMarker)).toBe(true)
  })

  it("reports the switch p90 and each layout by its name, not its place", () => {
    const comment = timingComment(report, { label: "This pull request" })
    expect(comment).toContain("| Measure | This pull request |\n")
    expect(comment).toContain("| Switch p90 | 35 ms |")
    expect(comment).toContain("| Grid main-thread share | 91% |")
    expect(comment).toContain("| Focus frames over 33 ms | 1 |")
  })

  context("beside main's last run", () => {
    it("shows main's numbers and commit", () => {
      const main = {
        ...report,
        commit: "fedcba9876543210",
        summary: { ...report.summary, switchP90Ms: 50 },
      }
      const comment = timingComment(report, { main })
      expect(comment).toContain("| Measure | This run | Main (fedcba9) |")
      expect(comment).toContain("| Switch p90 | 35 ms | 50 ms |")
    })

    it("says when main's own run stopped short", () => {
      const main = { ...report, error: "Agents never started\n    at run (main.ts:1)" }
      const comment = timingComment(report, { main })
      expect(comment).toContain("> ⚠️ Main's run stopped short: Agents never started\n")
      expect(comment).not.toContain("main.ts:1")
    })
  })

  context("when the run stopped short or the sandbox complained", () => {
    it("says so above the numbers, and leaves what it lacks blank", () => {
      const short: TimingReport = {
        ...report,
        summary: { ...report.summary, switchP90Ms: null, agentsHeard: 3, steady: [] },
        problems: ["reaped 2 processes"],
        error: "Chromium crashed",
      }
      const comment = timingComment(short)
      expect(comment).toContain("This run stopped short: Chromium crashed")
      expect(comment).toContain("1 problem(s)")
      expect(comment).toContain("heard 3 of 5 fake agents")
      expect(comment).toContain("| Switch p90 | – |")
      expect(comment).toContain("| Grid main-thread share | – |")
    })
  })
})
