import { describe, expect, it } from "vitest"

import {
  uninstallTarget,
  validateUninstallCapture,
  validateQualityUninstallCapture,
  uninstallTargetStatus,
  qualityUninstallResult,
  type UninstallExecution,
  validateQualityUninstallMetadata,
  type UninstallMetadata,
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

const broadReport = (): UninstallReport => {
  const target = report().testResults![0]!
  return {
    ...report(),
    testResults: [
      { ...target, name: "/checkout/src/specs/uninstall.spec.tsx" },
      ...["theme/apply.test.ts", "specs/companions.spec.tsx", "specs/motion.spec.tsx"].map(
        (file) => ({
          name: `/checkout/src/${file}`,
          assertionResults: [{ title: "other", status: "passed" }],
        }),
      ),
    ],
  }
}
const execution = (): UninstallExecution => ({
  pid: 1,
  began: 100,
  finished: true,
  total: 4,
  dropped: 0,
  modules: broadReport().testResults!.map((file, index) => ({
    file: file.name!,
    project: ["behaviour (chromium)", "unit", "behaviour (chromium)", "motion (chromium)"][index]!,
    started: 101,
  })),
})
describe("broad Quality uninstall evidence", () => {
  it("requires fresh actual execution of all three original UI projects", () => {
    expect(
      validateQualityUninstallCapture(broadReport(), captures(), execution(), 99),
    ).toBeUndefined()
    for (const project of ["unit", "behaviour (chromium)", "motion (chromium)"]) {
      const missing = execution()
      missing.modules = missing.modules.filter((module) => module.project !== project)
      missing.total = missing.modules.length
      expect(validateQualityUninstallCapture(broadReport(), captures(), missing, 99)).toBeDefined()
    }
    expect(validateQualityUninstallCapture(broadReport(), captures(), execution(), 101)).toContain(
      "stale",
    )
    expect(
      validateQualityUninstallCapture(
        broadReport(),
        captures(),
        { ...execution(), dropped: 1 },
        99,
      ),
    ).toContain("truncated")
    expect(
      validateQualityUninstallCapture(
        broadReport(),
        captures(),
        { ...execution(), finished: false },
        99,
      ),
    ).toBeDefined()
  })

  it("requires exactly one uninstall file and complete original successful retry evidence", () => {
    const duplicated = broadReport()
    duplicated.testResults!.push(duplicated.testResults![0]!)
    expect(validateQualityUninstallCapture(duplicated, captures(), execution(), 99)).toContain(
      "exactly once",
    )
    expect(
      validateQualityUninstallCapture(broadReport(), captures().slice(1), execution(), 99),
    ).toContain("Missing")
    const skipped = broadReport()
    skipped.testResults![0]!.assertionResults![0]!.status = "skipped"
    expect(validateQualityUninstallCapture(skipped, captures(), execution(), 99)).toBeDefined()
  })

  it("retains a failed first retry without requiring its missing result or a second click", () => {
    const failed = broadReport()
    failed.success = false
    failed.testResults![0]!.assertionResults![0]!.status = "failed"
    const records = captures()
    records[0]!.events = [
      { stage: "native", type: "click", action: "Uninstall", trusted: true },
      { stage: "confirm" },
      { stage: "poll-sample", present: false },
      { stage: "render" },
      { stage: "fixture-scheduled", delayMs: 1500 },
      { stage: "test-failed" },
    ]
    expect(uninstallTargetStatus(failed)).toBe("failed")
    expect(validateQualityUninstallCapture(failed, records, execution(), 99)).toBeUndefined()
    records[0]!.events!.pop()
    expect(validateQualityUninstallCapture(failed, records, execution(), 99)).toContain(
      "failure boundaries",
    )
  })

  it("retains target completeness independently of an unrelated suite failure", () => {
    const failed = broadReport()
    failed.success = false
    failed.testResults![1]!.assertionResults![0]!.status = "failed"
    expect(uninstallTargetStatus(failed)).toBe("passed")
    expect(validateQualityUninstallCapture(failed, captures(), execution(), 99)).toBeUndefined()
  })
})

const metadata = (): UninstallMetadata => ({
  config: {
    scope: "quality",
    pid: 1,
    projects: [
      { name: "unit", testTimeout: 20_000 },
      { name: "behaviour", testTimeout: 30_000 },
      { name: "motion", testTimeout: 30_000 },
    ],
  },
  browser: { version: "156.0", viewport: { width: 1440, height: 900 } },
  sources: { total: 1, dropped: 0, observedUntil: 100, finalFlush: true, events: [{}] },
  transforms: Object.fromEntries(
    [
      ["fixture", "backend/demo/debug/uninstall.ts"],
      ["component", "preferences/UninstallApp.tsx"],
      ["spec", "specs/uninstall.spec.tsx"],
    ].map(([name, file]) => [
      `${name}.json`,
      {
        file: `application/ui/src/${file}`,
        incomingSourceSha256: "a".repeat(64),
        transformedSourceSha256: "b".repeat(64),
      },
    ]),
  ),
})
describe("broad Quality capture identity", () => {
  it("requires exact source manifests, original browser/config identity and final source flush", () => {
    expect(validateQualityUninstallMetadata(metadata(), execution())).toBeUndefined()
    const replaced = metadata()
    replaced.transforms["wrong.json"] = replaced.transforms["fixture.json"]!
    delete replaced.transforms["fixture.json"]
    expect(validateQualityUninstallMetadata(replaced, execution())).toContain("exact")
    for (const changed of [
      { ...metadata(), browser: {} },
      { ...metadata(), config: { ...metadata().config, pid: 2 } },
      { ...metadata(), config: { ...metadata().config, projects: [] } },
      { ...metadata(), sources: { ...metadata().sources, dropped: 1 } },
    ])
      expect(validateQualityUninstallMetadata(changed, execution())).toBeDefined()
    const hash = metadata()
    hash.transforms["spec.json"]!.transformedSourceSha256 = "not-a-hash"
    expect(validateQualityUninstallMetadata(hash, execution())).toContain("Invalid")
  })
})

describe("broad root process classification", () => {
  it("separates target, other Quality, incomplete and watchdog failures without reruns", () => {
    const failed = broadReport()
    failed.success = false
    failed.testResults![0]!.assertionResults![0]!.status = "failed"
    expect(
      qualityUninstallResult({ code: 1, status: "process-failure" }, failed, undefined, 0).status,
    ).toBe("target-failure")
    expect(
      qualityUninstallResult({ code: 1, status: "process-failure" }, broadReport(), undefined, 0)
        .status,
    ).toBe("other-quality-failure")
    expect(
      qualityUninstallResult({ code: 0, status: "passed" }, broadReport(), undefined, 0).status,
    ).toBe("passed")
    for (const code of [0, 1]) {
      expect(
        qualityUninstallResult({ code, status: "process-failure" }, failed, undefined, 1).status,
      ).toBe("incomplete-capture")
      expect(
        qualityUninstallResult({ code, status: "process-failure" }, failed, "Missing stages", 0)
          .status,
      ).toBe("incomplete-capture")
    }
    expect(
      qualityUninstallResult({ code: 1, status: "timeout" }, failed, "Missing report", 0),
    ).toMatchObject({ status: "timeout", issue: "Missing report" })
    expect(
      qualityUninstallResult({ code: 1, status: "process-failure" }, undefined, "Missing report", 0)
        .status,
    ).toBe("incomplete-capture")
  })
})
