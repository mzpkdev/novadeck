import { execFileSync, spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import { createWriteStream, readFileSync } from "node:fs"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import {
  validateUninstallCapture,
  type UninstallCapture,
  type UninstallReport,
} from "./uninstall-results.ts"

const repo = fileURLToPath(new URL("../../", import.meta.url))
const ui = join(repo, "application/ui")
const require = createRequire(join(ui, "package.json"))
let captureOutput: string | undefined

const request = (args: readonly string[]): { output: string; attempts: number } => {
  let output = join(tmpdir(), `novadeck-uninstall-${randomUUID()}`)
  let attempts = 3
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`)
    if (flag === "--output") output = resolve(value)
    else if (flag === "--attempts" && /^[1-3]$/.test(value)) attempts = Number(value)
    else throw new Error(`Unknown argument or invalid attempt count: ${flag} ${value}`)
  }
  const within = relative(repo, output)
  if (!within || (!isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`)))
    throw new Error("Uninstall capture output must be outside the repository")
  return { output, attempts }
}

const json = (file: string, value: unknown): Promise<void> =>
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`)

type Result = {
  code: number
  status: "passed" | "process-failure" | "incomplete-capture" | "timeout" | "interrupted" | "error"
}

const run = async (output: string, vitest: string, budget: number): Promise<Result> => {
  const config = join(repo, "scripts/flaky-capture/uninstall.config.mts")
  const log = createWriteStream(join(output, "process.log"))
  // The same CLI as pnpm exec vitest, without a cmd.exe wrapper on Windows.
  const child = spawn(
    process.execPath,
    [
      vitest,
      "run",
      "--config",
      config,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${join(output, "tests.json")}`,
    ],
    {
      cwd: ui,
      env: { ...process.env, CI: "1", NOVADECK_UI_TRACE: "1", NOVADECK_UNINSTALL_OUTPUT: output },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  )
  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk)
    log.write(chunk)
  })
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk)
    log.write(chunk)
  })
  let timedOut = false
  let interrupted = false
  let force: ReturnType<typeof setTimeout> | undefined
  const stop = (): void => {
    if (!child.pid) return
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on(
        "error",
        () => child.kill(),
      )
      return
    }
    const kill = (signal: NodeJS.Signals): void => {
      try {
        process.kill(-child.pid!, signal)
      } catch {
        child.kill(signal)
      }
    }
    kill("SIGTERM")
    force = setTimeout(() => kill("SIGKILL"), 5000)
  }
  const interrupt = (): void => {
    interrupted = true
    stop()
  }
  const timeout = setTimeout(
    () => {
      timedOut = true
      stop()
    },
    Math.min(budget, 5 * 60_000),
  )
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", interrupt)
  try {
    const [code, signal] = (await once(child, "close")) as [number | null, string | null]
    const result: Result = {
      code: timedOut || interrupted ? 1 : (code ?? 1),
      status: timedOut
        ? "timeout"
        : interrupted
          ? "interrupted"
          : code === 0
            ? "passed"
            : "process-failure",
    }
    await json(join(output, "process.json"), { ...result, nativeCode: code, signal })
    return result
  } finally {
    clearTimeout(timeout)
    clearTimeout(force)
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    await new Promise<void>((done) => log.end(done))
  }
}

const main = async (): Promise<void> => {
  if (process.argv.includes("--help")) {
    console.log(
      "node scripts/flaky-capture/uninstall.ts [--output /outside/repo] [--attempts 1..3]",
    )
    return
  }
  const { output, attempts } = request(process.argv.slice(2))
  await mkdir(dirname(output), { recursive: true })
  await mkdir(output)
  captureOutput = output
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  const expected = process.env.NOVADECK_CAPTURE_HEAD
  const version = (name: string): string =>
    (
      JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")) as {
        version: string
      }
    ).version
  const files = [
    "application/ui/src/specs/uninstall.spec.tsx",
    "application/ui/src/specs/setup.ts",
    "application/ui/src/specs/support/workspace.tsx",
    "application/ui/src/backend/demo/debug/uninstall.ts",
    "application/ui/src/preferences/UninstallApp.tsx",
    "application/ui/src/preferences/uninstall.ts",
    "application/ui/vitest.config.ts",
    "scripts/flaky-capture/uninstall.ts",
    "scripts/flaky-capture/uninstall-results.ts",
    "scripts/flaky-capture/uninstall-instrument.ts",
    "scripts/flaky-capture/uninstall.config.mts",
    "scripts/flaky-capture/uninstall.setup.mjs",
    "scripts/flaky-capture/uninstall-events.mjs",
  ]
  await json(join(output, "identity.json"), {
    mode: "passive-control",
    instrumentation: "opt-in guarded source-boundary observations",
    head,
    expectedHead: expected,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    vitest: version("vitest"),
    playwright: version("playwright"),
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    attempts,
    hashes: Object.fromEntries(
      files.map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(join(repo, file)))
          .digest("hex"),
      ]),
    ),
  })
  if (expected && head !== expected)
    throw new Error(`Capture checkout ${head} differs from ${expected}`)
  const packageFile = require.resolve("vitest/package.json")
  const packageInfo = JSON.parse(readFileSync(packageFile, "utf8")) as { bin: { vitest: string } }
  const vitest = resolve(dirname(packageFile), packageInfo.bin.vitest)
  const results: (Result & { attempt: number; cases: number; issue?: string })[] = []
  const deadline = performance.now() + 15 * 60_000
  // Each process must finish before its result decides whether another may start.
  /* eslint-disable no-await-in-loop */
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const folder = join(output, `attempt-${String(attempt).padStart(2, "0")}`)
    await mkdir(folder)
    console.log(`Uninstall capture ${attempt}/${attempts}: ${folder}`)
    let result: Result
    let issue: string | undefined
    try {
      result = await run(folder, vitest, Math.max(0, deadline - performance.now()))
      if (result.code === 0) {
        const report = JSON.parse(
          await readFile(join(folder, "tests.json"), "utf8"),
        ) as UninstallReport
        const captured = (await readdir(folder)).filter((file) => /^case-\d+\.json$/.test(file))
        const captures = await Promise.all(
          captured.map(
            async (file) =>
              JSON.parse(await readFile(join(folder, file), "utf8")) as UninstallCapture,
          ),
        )
        issue = validateUninstallCapture(report, captures)
        if (!issue && (await readdir(join(folder, "transforms"))).length !== 3)
          issue = "Missing guarded source-boundary transform identity"
        if (issue) result = { code: 1, status: "incomplete-capture" }
      }
    } catch (error) {
      await json(join(folder, "error.json"), { error: String(error) })
      result = { code: 1, status: "error" }
    }
    const cases = (await readdir(folder)).filter((file) => /^case-\d+\.json$/.test(file)).length
    results.push({ attempt, ...result, cases, ...(issue ? { issue } : {}) })
    await json(join(output, "summary.json"), {
      requested: attempts,
      completed: results.length,
      status: result.code === 0 ? (attempt === attempts ? "passed" : "running") : result.status,
      results,
    })
    if (result.code !== 0) {
      process.exitCode = result.code
      return
    }
  }
  /* eslint-enable no-await-in-loop */
}

await main().catch(async (error: unknown) => {
  console.error(error)
  if (captureOutput) await json(join(captureOutput, "error.json"), { error: String(error) })
  process.exitCode = 1
})
