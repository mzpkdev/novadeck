import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { availableParallelism, tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { approvalTest } from "./agy-approval-instrument.ts"
import { approvalTarget } from "./agy-approval-reporter.ts"

const root = fileURLToPath(new URL("../../", import.meta.url))
const runner = join(root, "application/runner")
const require = createRequire(join(runner, "package.json"))
const save = (folder: string, name: string, value: unknown) =>
  writeFileSync(join(folder, name), JSON.stringify(value, null, 2) + "\n")
const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

/** A passing process alone cannot turn skipped or incomplete capture into success. */
export const approvalResult = (report: unknown, capture: unknown): string | undefined => {
  const suite = object(report)
  const summary = object(capture)
  const files = Array.isArray(suite.testResults) ? suite.testResults : []
  const tests = files
    .flatMap((file) => {
      const found = object(file).assertionResults
      return Array.isArray(found) ? found : []
    })
    .map(object)
  const passed = tests.filter((test) => test.status === "passed")
  if (
    passed.length !== 1 ||
    passed[0]?.fullName !== `Antigravity ${approvalTest}` ||
    tests.some((test) => test.status === "failed")
  )
    return "The original approval case did not finish as the single passing test"
  if (
    summary.outcome !== "passed" ||
    summary.complete !== true ||
    summary.overflow !== false ||
    summary.nativeOverflow !== false ||
    summary.observerErrors !== 0 ||
    summary.frameErrors !== 0 ||
    summary.duplicateStages !== 0 ||
    [summary.missingRaw, summary.missingSized, summary.missingDecoded].some(
      (missing) => !Array.isArray(missing) || missing.length > 0,
    )
  )
    return "The approval observations were incomplete or the scenario failed"
  const counts = object(summary.counts)
  if (
    counts.preToolUse !== 2 ||
    counts.sessionObservedPreToolUse !== 2 ||
    counts.answers !== 2 ||
    !(typeof counts.nativeChunks === "number" && counts.nativeChunks > 0) ||
    !(typeof counts.nativeFrames === "number" && counts.nativeFrames > 0)
  )
    return "The two original tool occurrences and explicit answers were not captured"
  return undefined
}

/** A target checkpoint is independent of the eventual whole-suite exit status. */
export const approvalSuiteResult = (
  inventory: unknown,
  capture: unknown,
  expectedFiles: readonly string[],
  processResult: { code: number | null; timedOut: boolean; interrupted: boolean },
) => {
  const run = object(inventory)
  const target = object(run.target)
  const summary = object(capture)
  const collected = object(run.collected)
  const tests = Object.values(collected).flatMap((value) =>
    Array.isArray(value) ? value.map(object) : [],
  )
  const targets = tests.filter(
    (test) =>
      typeof test.name === "string" &&
      typeof test.file === "string" &&
      approvalTarget(test.name, test.file),
  )
  const targetState =
    targets.length === 1 &&
    target.id === targets[0]?.id &&
    typeof target.state === "string" &&
    ["passed", "failed"].includes(target.state)
      ? target.state
      : "unavailable-or-skipped"
  const telemetry =
    summary.complete === true &&
    summary.overflow === false &&
    summary.nativeOverflow === false &&
    summary.observerErrors === 0 &&
    summary.frameErrors === 0 &&
    summary.duplicateStages === 0 &&
    [summary.missingRaw, summary.missingSized, summary.missingDecoded].every(
      (value) => Array.isArray(value) && value.length === 0,
    )
  const successIssue =
    targetState === "passed"
      ? approvalResult(
          {
            testResults: [
              {
                assertionResults: [
                  {
                    fullName: `Antigravity ${approvalTest}`,
                    status: "passed",
                  },
                ],
              },
            ],
          },
          capture,
        )
      : undefined
  const sameFiles = (value: unknown) =>
    Array.isArray(value) &&
    value.length === expectedFiles.length &&
    new Set(value).size === value.length &&
    expectedFiles.every((file) => value.includes(file))
  const inventoryComplete =
    run.ended === true &&
    run.overflow === false &&
    sameFiles(run.specifications) &&
    sameFiles(Object.keys(collected)) &&
    tests.length > 1 &&
    tests.every((test) => ["passed", "failed", "skipped"].includes(String(test.state)))
  const suite = processResult.timedOut
    ? "infrastructure-timeout"
    : processResult.interrupted
      ? "interrupted"
      : processResult.code !== 0 ||
          run.errors !== 0 ||
          tests.some((test) => test.state === "failed")
        ? "failed-or-errored"
        : inventoryComplete
          ? "passed"
          : "incomplete"
  const targetComplete = telemetry && !successIssue && targetState !== "unavailable-or-skipped"
  return {
    suite,
    target: targetState,
    targetComplete,
    inventoryComplete,
    scenario: summary.outcome ?? "unavailable-before-scenario",
    passed: suite === "passed" && targetState === "passed" && targetComplete && inventoryComplete,
    ...(successIssue && { targetIssue: successIssue }),
  }
}

export const approvalScope = (scope: string | undefined) => {
  if (scope !== undefined && scope !== "case" && scope !== "suite")
    throw new Error("--scope must be case or suite")
  return scope ?? "case"
}

const main = async () => {
  const { values } = parseArgs({
    options: { output: { type: "string" }, scope: { type: "string" } },
  })
  const scope = approvalScope(values.scope)
  const suite = scope === "suite"
  const watchdogMs = suite ? 40 * 60_000 : 300_000
  if (!values.output) throw new Error("--output outside the checkout is required")
  const output = resolve(values.output)
  const within = relative(root, output)
  if (!within || (!isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`)))
    throw new Error("AGY approval capture output must be outside the checkout")
  if (existsSync(output) && readdirSync(output).length)
    throw new Error("--output must be new or empty")
  mkdirSync(output, { recursive: true })
  save(output, "process.json", { status: "initializing", attempts: 1 })
  let scratch: string | undefined
  try {
    if (process.platform !== "win32")
      throw new Error("AGY approval capture requires native Windows")
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })
    if (
      head.status !== 0 ||
      (process.env.NOVADECK_CAPTURE_HEAD &&
        head.stdout.trim() !== process.env.NOVADECK_CAPTURE_HEAD)
    )
      throw new Error("AGY approval capture checkout identity mismatch")
    const e2eFiles = readdirSync(join(runner, "src/e2e"), { recursive: true })
      .filter(
        (file): file is string =>
          typeof file === "string" &&
          file.endsWith(".e2e.ts") &&
          !file.replaceAll("\\", "/").startsWith("probes/"),
      )
      .map((file) => `src/e2e/${file.replaceAll("\\", "/")}`)
      .toSorted()
    const files = [
      "application/runner/src/e2e/answers.e2e.ts",
      "application/runner/src/shell/hook.ts",
      "application/runner/src/e2e/probes/agy-approval-capture.ts",
      "scripts/flaky-capture/agy-approval.ts",
      "scripts/flaky-capture/agy-approval-events.ts",
      "scripts/flaky-capture/agy-approval-instrument.ts",
      "scripts/flaky-capture/agy-approval.config.mts",
      "scripts/flaky-capture/agy-approval-reporter.ts",
      "application/runner/vitest.e2e.config.ts",
      "application/runner/package.json",
      ".github/workflows/e2e.yml",
      ...e2eFiles.map((file) => `application/runner/${file}`),
    ]
    save(output, "identity.json", {
      head: head.stdout.trim(),
      expectedHead: process.env.NOVADECK_CAPTURE_HEAD,
      node: process.version,
      platform: process.platform,
      cpus: availableParallelism(),
      attempts: 1,
      test: `Antigravity ${approvalTest}`,
      scope,
      watchdogMs,
      equivalentPackageScript: "pnpm --filter @novadeck/runner test:e2e",
      invocation: "resolved Vitest CLI with capture overlay inheriting vitest.e2e.config.ts",
      expectedFiles: e2eFiles,
      sources: Object.fromEntries(
        files.map((file) => [
          file,
          createHash("sha256")
            .update(readFileSync(join(root, file)))
            .digest("hex"),
        ]),
      ),
    })
    scratch = suite ? mkdtempSync(join(tmpdir(), "novadeck-agy-approval-traces-")) : undefined
    const log = openSync(join(output, "process.log"), "w")
    let timedOut = false
    let interrupted = false
    const child = spawn(
      process.execPath,
      [
        join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"),
        "run",
        "--config",
        join(root, "scripts/flaky-capture/agy-approval.config.mts"),
      ],
      {
        cwd: runner,
        env: {
          ...process.env,
          CI: "1",
          NOVADECK_E2E_AGENTS: "agy",
          NOVADECK_E2E_HARNESS: "pinned",
          NOVADECK_E2E_PROBES: "",
          NOVADECK_E2E_TRACE_ALL: suite ? "" : "1",
          NOVADECK_E2E_TRACES: scratch ?? join(output, "traces"),
          NOVADECK_AGY_APPROVAL_SCOPE: scope,
          NOVADECK_AGY_APPROVAL_CAPTURE: "1",
          NOVADECK_AGY_APPROVAL_OUTPUT: output,
        },
        stdio: ["ignore", log, log],
      },
    )
    const stop = () => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on(
        "error",
        () => child.kill(),
      )
    }
    const interrupt = () => {
      interrupted = true
      stop()
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, watchdogMs)
    process.on("SIGINT", interrupt)
    process.on("SIGTERM", interrupt)
    let code: number | null
    let signal: string | null
    try {
      ;[code, signal] = (await once(child, "close")) as [number | null, string | null]
    } finally {
      clearTimeout(timer)
      process.off("SIGINT", interrupt)
      process.off("SIGTERM", interrupt)
      closeSync(log)
    }
    const traces = scratch ?? join(output, "traces")
    if (suite) {
      const targetTrace =
        "src-e2e-answers.e2e.ts-Antigravity-approves-two-identical-queued-commands-from-the-chat-in-turn-each-running-once.txt"
      if (existsSync(join(traces, targetTrace)))
        copyFileSync(join(traces, targetTrace), join(output, "hooks.txt"))
    } else if (existsSync(traces))
      for (const file of readdirSync(traces))
        if (file.endsWith(".txt")) copyFileSync(join(traces, file), join(output, "hooks.txt"))
    const read = (name: string): unknown =>
      existsSync(join(output, name))
        ? JSON.parse(readFileSync(join(output, name), "utf8"))
        : undefined
    const summary = read("summary.json")
    const missingTransform = ["hook", "case"].some(
      (name) => !existsSync(join(output, "transforms", `${name}.json`)),
    )
    const full = suite
      ? approvalSuiteResult(read("suite.json"), summary, e2eFiles, { code, timedOut, interrupted })
      : undefined
    const issue = missingTransform
      ? "Required source transforms were not observed"
      : full
        ? full.passed
          ? undefined
          : "See independent suite/target/completeness outcomes"
        : approvalResult(read("tests.json"), summary)
    const status = timedOut
      ? "infrastructure-timeout"
      : interrupted
        ? "interrupted"
        : code !== 0
          ? "test-or-infrastructure-failure"
          : issue
            ? "incomplete-capture"
            : "passed"
    save(output, "process.json", {
      status,
      code,
      signal,
      timedOut,
      interrupted,
      attempts: 1,
      scenario: object(summary).outcome ?? "unavailable-before-scenario",
      scope,
      ...(full && { fullSuite: full }),
      issue,
    })
    if (status !== "passed") process.exitCode = 1
  } catch (error) {
    save(output, "process.json", {
      status: "infrastructure-error",
      attempts: 1,
      error: String(error),
    })
    throw error
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  }
}
if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
