import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  approvalSenderMatches,
  observeApprovalIngress,
  observationPairs,
  payloadMetadata,
  watchApprovalIngress,
} from "./agy-approval-events.ts"
import { approvalTest, instrumentApproval } from "./agy-approval-instrument.ts"
import { approvalResult, approvalScope, approvalSuiteResult } from "./agy-approval.ts"

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

describe("AGY full-suite capture", () => {
  const files = ["src/e2e/answers.e2e.ts", "src/e2e/chat.e2e.ts"]
  const target = {
    id: "target",
    name: `Antigravity > ${approvalTest}`,
    file: files[0],
    state: "passed",
  }
  const other = { id: "other", name: "Antigravity > other", file: files[1], state: "passed" }
  const inventory = {
    ended: true,
    errors: 0,
    overflow: false,
    specifications: files,
    collected: { [files[0]!]: [target], [files[1]!]: [other] },
    target,
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
      nativeChunks: 1,
      nativeFrames: 1,
    },
  }
  const exit = { code: 0, timedOut: false, interrupted: false }

  it("keeps unrelated suite failures and later watchdog separate from the target checkpoint", () => {
    expect(approvalSuiteResult(inventory, capture, files, exit)).toMatchObject({
      passed: true,
      target: "passed",
      inventoryComplete: true,
    })
    expect(approvalSuiteResult(inventory, capture, files, { ...exit, code: 1 })).toMatchObject({
      passed: false,
      suite: "failed-or-errored",
      target: "passed",
      targetComplete: true,
    })
    expect(
      approvalSuiteResult({ ...inventory, ended: false }, capture, files, {
        ...exit,
        timedOut: true,
      }),
    ).toMatchObject({
      passed: false,
      suite: "infrastructure-timeout",
      target: "passed",
      targetComplete: true,
      inventoryComplete: false,
    })
    const failed = { ...target, state: "failed" }
    expect(
      approvalSuiteResult(
        {
          ...inventory,
          target: failed,
          collected: { ...inventory.collected, [files[0]!]: [failed] },
        },
        { ...capture, outcome: "scenario-failure", counts: { ...capture.counts, answers: 1 } },
        files,
        { ...exit, code: 1 },
      ),
    ).toMatchObject({ passed: false, target: "failed", targetComplete: true })
  })

  it("rejects narrowed, unexecuted, duplicate-target and incomplete observations", () => {
    for (const broken of [
      { ...inventory, specifications: files.slice(0, 1) },
      { ...inventory, ended: false },
      { ...inventory, overflow: true },
      { ...inventory, target: undefined },
      { ...inventory, collected: { ...inventory.collected, [files[0]!]: [target, target] } },
      {
        ...inventory,
        collected: { ...inventory.collected, [files[1]!]: [{ ...other, state: "pending" }] },
      },
    ])
      expect(approvalSuiteResult(broken, capture, files, exit).passed).toBe(false)
    expect(
      approvalSuiteResult(inventory, { ...capture, overflow: true }, files, exit),
    ).toMatchObject({ passed: false, target: "passed", targetComplete: false })
  })

  it("filters foreign hooks before reading payload metadata, even during overlap or a new binding", () => {
    const expected = { terminalId: "target", token: "private-token" }
    const observed: unknown[] = []
    const stop = watchApprovalIngress((event) => {
      if (approvalSenderMatches(event, expected)) observed.push(payloadMetadata(event.payload))
    })
    try {
      for (const sender of [
        { terminalId: "foreign", token: expected.token },
        { terminalId: expected.terminalId, token: "old-token" },
        { terminalId: "next-binding", token: "next-token" },
        {},
      ])
        observeApprovalIngress({
          stage: "raw-ingress",
          agent: "agy",
          event: "PreToolUse",
          seq: 1,
          ...sender,
          get payload() {
            throw new Error("foreign payload must not be inspected")
          },
        })
      observeApprovalIngress({
        stage: "raw-ingress",
        agent: "agy",
        event: "PreToolUse",
        seq: 2,
        ...expected,
        payload: { tool_confirmation_pending: true, token: expected.token },
      })
    } finally {
      expect(stop()).toBe(0)
    }
    expect(observed).toHaveLength(1)
    expect(JSON.stringify(observed)).not.toContain(expected.token)
    expect(approvalSenderMatches(expected, undefined)).toBe(false)
  })

  it("records real Vitest collection/order and a target checkpoint independently of an unrelated failure", () => {
    const output = mkdtempSync(join(tmpdir(), "agy-approval-reporter-"))
    try {
      const require = createRequire(import.meta.url)
      const vitest = dirname(require.resolve("vitest/package.json"))
      const imports = `import {describe, it} from ${JSON.stringify(join(vitest, "dist/index.js").replaceAll("\\", "/"))};`
      mkdirSync(join(output, "src/e2e"), { recursive: true })
      writeFileSync(
        join(output, files[0]!),
        `${imports} describe('Antigravity',()=>it(${JSON.stringify(approvalTest)},()=>{}))`,
      )
      writeFileSync(
        join(output, files[1]!),
        `${imports} it('unrelated failure',()=>{throw Error('synthetic unrelated')})`,
      )
      const reporter = fileURLToPath(
        new URL("./agy-approval-reporter.ts", import.meta.url),
      ).replaceAll("\\", "/")
      const config = join(output, "vitest.config.mts")
      writeFileSync(
        config,
        `import Reporter from ${JSON.stringify(reporter)}; export default {root:${JSON.stringify(output.replaceAll("\\", "/"))},test:{include:['src/e2e/*.e2e.ts'],fileParallelism:false,reporters:[new Reporter()]}}`,
      )
      const child = spawnSync(
        process.execPath,
        [join(vitest, "vitest.mjs"), "run", "--config", config],
        {
          encoding: "utf8",
          timeout: 15_000,
          env: { ...process.env, NOVADECK_AGY_APPROVAL_OUTPUT: output },
        },
      )
      expect(child.error).toBeUndefined()
      expect(child.status, child.stderr).toBe(1)
      const run = JSON.parse(readFileSync(join(output, "suite.json"), "utf8"))
      expect(run.target).toMatchObject({ name: target.name, file: target.file, state: "passed" })
      expect(run.ended).toBe(true)
      expect(run.overflow).toBe(false)
      for (const type of [
        "module.collected",
        "module.start",
        "module.end",
        "case.start",
        "case.end",
      ])
        expect(run.events.some((event: { type: string }) => event.type === type)).toBe(true)
      expect(
        approvalSuiteResult(run, capture, files, { ...exit, code: child.status }),
      ).toMatchObject({
        suite: "failed-or-errored",
        target: "passed",
        targetComplete: true,
        inventoryComplete: true,
        passed: false,
      })
      // Interrupt the next real checkpoint write after the target has completed.
      // Direct truncation of suite.json makes this control fail to parse the target.
      const interrupted = join(output, "interrupted")
      mkdirSync(interrupted)
      writeFileSync(
        config,
        `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
        import Reporter from ${JSON.stringify(reporter)};
        const reporter = new Reporter(); const finish = reporter.onTestRunEnd;
        reporter.onTestRunEnd = (...args) => {
          const write = fs.writeFileSync;
          fs.writeFileSync = (file, ...rest) => {
            if (/suite\\.json(?:\\.tmp)?$/.test(String(file))) {
              write(file, '{"partial":'); throw Error('synthetic checkpoint interruption');
            }
            return write(file, ...rest);
          };
          syncBuiltinESMExports();
          try { return finish(...args) } finally { fs.writeFileSync = write; syncBuiltinESMExports() }
        };
        export default {root:${JSON.stringify(output.replaceAll("\\", "/"))},test:{include:['src/e2e/*.e2e.ts'],fileParallelism:false,reporters:[reporter]}}`,
      )
      const killedWrite = spawnSync(
        process.execPath,
        [join(vitest, "vitest.mjs"), "run", "--config", config],
        {
          encoding: "utf8",
          timeout: 15_000,
          env: { ...process.env, NOVADECK_AGY_APPROVAL_OUTPUT: interrupted },
        },
      )
      expect(killedWrite.error).toBeUndefined()
      expect(killedWrite.status).toBe(1)
      expect(killedWrite.stderr).toContain("synthetic checkpoint interruption")
      const checkpoint = JSON.parse(readFileSync(join(interrupted, "suite.json"), "utf8"))
      expect(readFileSync(join(interrupted, "suite.json.tmp"), "utf8")).toBe('{"partial":')
      expect(
        approvalSuiteResult(checkpoint, capture, files, { ...exit, timedOut: true }),
      ).toMatchObject({
        suite: "infrastructure-timeout",
        target: "passed",
        targetComplete: true,
        inventoryComplete: false,
      })
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  }, 20_000)

  it("inherits the original workload and deadlines only in suite mode without order/retry overrides", () => {
    const output = mkdtempSync(join(tmpdir(), "agy-approval-config-"))
    try {
      const script = `import config from './scripts/flaky-capture/agy-approval.config.mts'; console.log(JSON.stringify(config.test))`
      for (const scope of ["case", "suite"]) {
        const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
          cwd: new URL("../../", import.meta.url),
          encoding: "utf8",
          env: {
            ...process.env,
            NOVADECK_AGY_APPROVAL_CAPTURE: "1",
            NOVADECK_AGY_APPROVAL_OUTPUT: output,
            NOVADECK_AGY_APPROVAL_SCOPE: scope,
            NOVADECK_E2E_PROBES: "",
          },
        })
        expect(child.status, child.stderr).toBe(0)
        const config = JSON.parse(child.stdout)
        expect(config).toMatchObject({
          testTimeout: 180_000,
          hookTimeout: 600_000,
          fileParallelism: false,
          exclude: ["src/e2e/probes/**"],
        })
        expect(config.include).toEqual(
          scope === "suite" ? ["src/e2e/**/*.e2e.ts"] : ["src/e2e/answers.e2e.ts"],
        )
        expect(config.testNamePattern).toBe(
          scope === "suite" ? undefined : `^Antigravity > ${approvalTest}$`,
        )
        for (const key of ["sequence", "retry", "bail", "maxWorkers"])
          expect(config).not.toHaveProperty(key)
      }
      expect(approvalScope(undefined)).toBe("case")
      expect(() => approvalScope("all")).toThrow("case or suite")
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})
