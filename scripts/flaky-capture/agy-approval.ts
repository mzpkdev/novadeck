import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { availableParallelism } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { approvalTest } from "./agy-approval-instrument.ts"

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

const main = async () => {
  const { values } = parseArgs({ options: { output: { type: "string" } } })
  if (!values.output) throw new Error("--output outside the checkout is required")
  const output = resolve(values.output)
  const within = relative(root, output)
  if (!within || (!isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`)))
    throw new Error("AGY approval capture output must be outside the checkout")
  if (existsSync(output) && readdirSync(output).length)
    throw new Error("--output must be new or empty")
  mkdirSync(output, { recursive: true })
  save(output, "process.json", { status: "initializing", attempts: 1 })
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
    const files = [
      "application/runner/src/e2e/answers.e2e.ts",
      "application/runner/src/shell/hook.ts",
      "application/runner/src/e2e/probes/agy-approval-capture.ts",
      "scripts/flaky-capture/agy-approval.ts",
      "scripts/flaky-capture/agy-approval-events.ts",
      "scripts/flaky-capture/agy-approval-instrument.ts",
      "scripts/flaky-capture/agy-approval.config.mts",
    ]
    save(output, "identity.json", {
      head: head.stdout.trim(),
      expectedHead: process.env.NOVADECK_CAPTURE_HEAD,
      node: process.version,
      platform: process.platform,
      cpus: availableParallelism(),
      attempts: 1,
      test: `Antigravity ${approvalTest}`,
      watchdogMs: 300_000,
      sources: Object.fromEntries(
        files.map((file) => [
          file,
          createHash("sha256")
            .update(readFileSync(join(root, file)))
            .digest("hex"),
        ]),
      ),
    })
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
        "--reporter=default",
        "--reporter=json",
        `--outputFile.json=${join(output, "tests.json")}`,
      ],
      {
        cwd: runner,
        env: {
          ...process.env,
          CI: "1",
          NOVADECK_E2E_AGENTS: "agy",
          NOVADECK_E2E_HARNESS: "pinned",
          NOVADECK_E2E_TRACE_ALL: "1",
          NOVADECK_E2E_TRACES: join(output, "traces"),
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
    }, 300_000)
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
    const traces = join(output, "traces")
    if (existsSync(traces))
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
    const issue = missingTransform
      ? "Required source transforms were not observed"
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
