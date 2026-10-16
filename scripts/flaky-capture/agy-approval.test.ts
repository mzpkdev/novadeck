import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  observeApprovalIngress,
  observationPairs,
  payloadMetadata,
  watchApprovalIngress,
} from "./agy-approval-events.ts"
import { approvalTest, instrumentApproval } from "./agy-approval-instrument.ts"
import { approvalResult } from "./agy-approval.ts"

const original = readFileSync(
  new URL("../../application/runner/src/e2e/answers.e2e.ts", import.meta.url),
  "utf8",
)
const hook = readFileSync(
  new URL("../../application/runner/src/shell/hook.ts", import.meta.url),
  "utf8",
)
const events = "/capture/agy-approval-events.ts"
const recorder = "/capture/agy-approval-capture.ts"

describe("AGY approval capture boundaries", () => {
  it("wraps the unchanged original case and observes both sides of pruning", () => {
    const transformed = instrumentApproval(
      original,
      "/repo/application/runner/src/e2e/answers.e2e.ts",
      events,
      recorder,
    )!
    expect(transformed.code).toContain("await __capture.finish()")
    expect(
      instrumentApproval(
        original.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"),
        "/repo/application/runner/src/e2e/answers.e2e.ts",
        events,
        recorder,
      ),
    ).toBeDefined()
    expect(transformed.code.match(/__capture.attach\(t1\)/g)).toHaveLength(1)
    expect(transformed.code).toContain('"the second request to show its dialog",\n          60_000')
    const ingress = instrumentApproval(
      hook,
      "C:\\repo\\application\\runner\\src\\shell\\hook.ts",
      events,
      recorder,
    )!.code
    expect(ingress.match(/__approvalIngress\(/g)).toHaveLength(2)
    expect(ingress).toContain('stage: "raw-ingress"')
    expect(ingress).toContain('stage: "sized-payload"')
    expect(ingress.indexOf('stage: "raw-ingress"')).toBeLessThan(
      ingress.indexOf("payload: prune(payload"),
    )
    expect(ingress).toContain(JSON.stringify(events))
  })

  it("fails closed if the case or hook ingress changes", () => {
    expect(() =>
      instrumentApproval(
        original.replace('"the second request to show its dialog"', '"changed"'),
        "/repo/application/runner/src/e2e/answers.e2e.ts",
        events,
        recorder,
      ),
    ).toThrow("scenario changed")
    expect(() =>
      instrumentApproval(
        hook.replace("payload = JSON.parse(sent)", "payload = parse(sent)"),
        "/repo/application/runner/src/shell/hook.ts",
        events,
        recorder,
      ),
    ).toThrow("original payload")
    expect(instrumentApproval(original, "/unrelated.ts", events, recorder)).toBeUndefined()
  })

  it("distinguishes true, false and missing confirmation flags", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`field${index}`, index]),
    )
    const raw = { ...wide, tool_confirmation_pending: true }
    expect(payloadMetadata(raw)).toMatchObject({
      keys: 101,
      confirmation: { present: true, type: "boolean", value: true },
    })
    expect(payloadMetadata({ tool_confirmation_pending: false })).toMatchObject({
      confirmation: { present: true, value: false },
    })
    expect(payloadMetadata({})).toMatchObject({ confirmation: { present: false } })
  })

  it("never copies arbitrary flag objects, strings, tool input or credential fields", () => {
    const privateText = "a-private-value-that-must-not-be-archived"
    for (const flag of [{ token: privateText }, privateText]) {
      const summary = payloadMetadata({
        tool_confirmation_pending: flag,
        agent_state: privateText,
        token: privateText,
        env: privateText,
        account: privateText,
        toolCall: { name: privateText, args: { CommandLine: privateText, Cwd: privateText } },
      })
      expect(JSON.stringify(summary)).not.toContain(privateText)
      expect(summary.confirmation).not.toHaveProperty("value")
    }
  })

  it("requires all ingress/pruned/decoded pairs and reports overflow as incomplete", () => {
    expect(observationPairs([1, 2], [1, 2], [1, 2], false).complete).toBe(true)
    expect(observationPairs([], [], [], false).complete).toBe(false)
    expect(observationPairs([1, 1], [1], [1], false).complete).toBe(false)
    expect(observationPairs([1], [1, 2], [1, 2], false).missingRaw).toEqual([2])
    expect(observationPairs([1, 2], [1], [1], false).missingSized).toEqual([2])
    expect(observationPairs([1, 2], [1, 2], [1], false).missingDecoded).toEqual([2])
    expect(observationPairs([1], [1], [1], true).complete).toBe(false)
  })

  it("counts observer failures without changing the hook path and restores its observer", () => {
    const stop = watchApprovalIngress(() => {
      throw new Error("observer failure")
    })
    expect(() =>
      observeApprovalIngress({
        stage: "raw-ingress",
        agent: "agy",
        event: "StatusLine",
        seq: 1,
        payload: {},
      }),
    ).not.toThrow()
    expect(stop()).toBe(1)
    const again = watchApprovalIngress(() => {})
    expect(again()).toBe(0)
  })
})

describe("AGY approval capture pass classification", () => {
  const report = {
    testResults: [
      { assertionResults: [{ fullName: `Antigravity ${approvalTest}`, status: "passed" }] },
    ],
  }
  const capture = {
    outcome: "passed",
    complete: true,
    overflow: false,
    nativeOverflow: false,
    observerErrors: 0,
    frameErrors: 0,
    duplicateStages: 0,
    missingRaw: [],
    missingSized: [],
    missingDecoded: [],
    counts: {
      preToolUse: 2,
      sessionObservedPreToolUse: 2,
      answers: 2,
      nativeChunks: 3,
      nativeFrames: 3,
    },
  }
  it("accepts exactly the original case with both observed occurrences and explicit answers", () => {
    expect(approvalResult(report, capture)).toBeUndefined()
  })
  it("rejects skipped, failed, extra and missing tests", () => {
    expect(approvalResult({}, capture)).toBeDefined()
    for (const status of ["skipped", "failed"])
      expect(
        approvalResult(
          {
            testResults: [
              { assertionResults: [{ fullName: `Antigravity ${approvalTest}`, status }] },
            ],
          },
          capture,
        ),
      ).toBeDefined()
    expect(
      approvalResult(
        {
          testResults: [
            {
              assertionResults: [
                { status: "passed", fullName: `Antigravity ${approvalTest}` },
                { status: "passed", fullName: "other" },
              ],
            },
          ],
        },
        capture,
      ),
    ).toBeDefined()
  })
  it("rejects a nominal pass with overflow, missing stages, no frames or unobserved occurrences", () => {
    for (const broken of [
      { ...capture, complete: false },
      { ...capture, duplicateStages: 1 },
      { ...capture, overflow: true },
      { ...capture, missingRaw: [1] },
      { ...capture, missingSized: [2] },
      { ...capture, missingDecoded: [3] },
      { ...capture, counts: { ...capture.counts, nativeFrames: 0 } },
      { ...capture, counts: { ...capture.counts, sessionObservedPreToolUse: 1 } },
      { ...capture, counts: { ...capture.counts, answers: 1 } },
    ])
      expect(approvalResult(report, broken)).toBeDefined()
  })
})
