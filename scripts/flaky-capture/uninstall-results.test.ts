import { describe, expect, it } from "vitest"

import {
  uninstallTarget,
  validateUninstallCapture,
  type UninstallCapture,
  type UninstallReport,
} from "./uninstall-results.ts"

const report = (): UninstallReport => ({
  success: true,
  numTotalTests: 11,
  numPassedTests: 11,
  testResults: [
    {
      name: "/checkout/uninstall.spec.tsx",
      assertionResults: Array.from({ length: 11 }, (_, index) => ({
        title: index === 0 ? uninstallTarget : `case ${index}`,
        status: "passed",
      })),
    },
  ],
})
const captures = (): UninstallCapture[] =>
  Array.from({ length: 11 }, (_, index) => ({
    name: index === 0 ? uninstallTarget : `case ${index}`,
    dropped: 0,
    sourceDropped: 0,
    events: [1, 2].flatMap((attempt) => [
      { stage: "confirm" },
      { stage: "fixture-scheduled", attempt, delayMs: 1500 },
      { stage: "fixture-fired", attempt },
      { stage: "result" },
      { stage: "native", type: "click", action: "Uninstall", trusted: true },
      { stage: "poll-sample", present: true },
      { stage: "render", state: { buttons: [{ name: "Removing…", disabled: true }] } },
      { stage: "render", state: { alert: "quit it and open it again." } },
    ]),
  }))

describe("uninstall capture completeness", () => {
  it("accepts the complete original file with both retry timelines", () => {
    expect(validateUninstallCapture(report(), captures())).toBeUndefined()
  })
  it("rejects empty, skipped, missing or truncated controls", () => {
    expect(validateUninstallCapture({ success: true }, [])).toBeDefined()
    expect(validateUninstallCapture({ ...report(), numPassedTests: 10 }, captures())).toBeDefined()
    expect(validateUninstallCapture(report(), captures().slice(1))).toBeDefined()
    const truncated = captures()
    truncated[0]!.dropped = 1
    expect(validateUninstallCapture(report(), truncated)).toContain("truncated")
  })
  it("rejects missing timer, result, poll and rendered-state observations", () => {
    for (const stage of ["fixture-scheduled", "fixture-fired", "result", "poll-sample", "render"]) {
      const incomplete = captures()
      incomplete[0]!.events = incomplete[0]!.events!.filter((event) => event.stage !== stage)
      expect(validateUninstallCapture(report(), incomplete)).toBeDefined()
    }
  })
  it("requires original timer deadlines and trusted native clicks", () => {
    const changed = captures()
    changed[0]!.events!.find((event) => event.stage === "fixture-scheduled")!.delayMs = 6000
    expect(validateUninstallCapture(report(), changed)).toContain("1500ms")
    const synthetic = captures()
    synthetic[0]!.events!.find((event) => event.stage === "native")!.trusted = false
    expect(validateUninstallCapture(report(), synthetic)).toContain("native")
  })
})
