import { appendFileSync, renameSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

import type { Reporter, TestCase, TestModule } from "vitest/node"

import { approvalTest } from "./agy-approval-instrument.ts"

export const approvalTarget = (name: string, file: string) =>
  name === `Antigravity > ${approvalTest}` && file === "src/e2e/answers.e2e.ts"

/** Reporter callbacks occur outside the captured PTY/input boundaries. Never sets ordering. */
export default class ApprovalInventory implements Reporter {
  private readonly folder = process.env.NOVADECK_AGY_APPROVAL_OUTPUT!
  private readonly events: object[] = []
  private root = ""
  private overflow = false
  private bytes = 0
  private target: object | undefined
  private specifications: string[] = []
  private readonly collected = new Map<string, object[]>()
  private ended = false
  private errors = 0
  private reason: string | undefined

  private file(module: TestModule) {
    return module.relativeModuleId.replaceAll("\\", "/")
  }
  private test(test: TestCase) {
    return {
      id: test.id,
      file: this.file(test.module),
      name: test.fullName,
      state: test.result().state,
    }
  }
  private note(type: string, value: object) {
    const event = { at: Date.now(), type, ...value }
    this.bytes += Buffer.byteLength(JSON.stringify(event))
    if (this.events.length >= 5_000 || this.bytes > 8 * 1024 * 1024) {
      this.overflow = true
      return
    }
    this.events.push(event)
    appendFileSync(join(this.folder, "suite-order.jsonl"), JSON.stringify(event) + "\n")
  }
  private checkpoint() {
    writeFileSync(
      join(this.folder, "suite.json.tmp"),
      JSON.stringify(
        {
          ended: this.ended,
          errors: this.errors,
          reason: this.reason,
          overflow: this.overflow,
          specifications: this.specifications,
          collected: Object.fromEntries(this.collected),
          target: this.target,
          events: this.events,
        },
        null,
        2,
      ) + "\n",
    )
    renameSync(join(this.folder, "suite.json.tmp"), join(this.folder, "suite.json"))
  }
  onInit: NonNullable<Reporter["onInit"]> = (vitest) => {
    const config = vitest.config
    this.root = config.root
    writeFileSync(
      join(this.folder, "suite-config.json"),
      JSON.stringify(
        {
          include: config.include,
          exclude: config.exclude,
          testTimeout: config.testTimeout,
          hookTimeout: config.hookTimeout,
          maxWorkers: config.maxWorkers,
          retry: config.retry,
          bail: config.bail,
          testNamePattern: config.testNamePattern?.source ?? null,
          sequence: { shuffle: config.sequence.shuffle, seed: config.sequence.seed },
        },
        null,
        2,
      ) + "\n",
    )
  }
  onTestRunStart: NonNullable<Reporter["onTestRunStart"]> = (specifications) => {
    this.specifications = specifications.map((spec) =>
      relative(this.root, spec.moduleId).replaceAll("\\", "/"),
    )
    this.note("run.start", { files: this.specifications })
    this.checkpoint()
  }
  onTestModuleCollected: NonNullable<Reporter["onTestModuleCollected"]> = (module) => {
    const file = this.file(module)
    const tests = [...module.children.allTests()].map((test) => this.test(test))
    this.collected.set(file, tests)
    this.note("module.collected", { file, tests })
    this.checkpoint()
  }
  onTestModuleStart: NonNullable<Reporter["onTestModuleStart"]> = (module) => {
    this.note("module.start", { file: this.file(module) })
    this.checkpoint()
  }
  onTestCaseReady: NonNullable<Reporter["onTestCaseReady"]> = (test) => {
    this.note("case.start", this.test(test))
  }
  onTestCaseResult: NonNullable<Reporter["onTestCaseResult"]> = (test) => {
    const result = this.test(test)
    this.note("case.end", result)
    if (approvalTarget(result.name, result.file)) {
      this.target = result
      // Survives failures/timeouts in later cases, independently of finalized JSON output.
      this.checkpoint()
    }
  }
  onTestModuleEnd: NonNullable<Reporter["onTestModuleEnd"]> = (module) => {
    this.collected.set(
      this.file(module),
      [...module.children.allTests()].map((test) => this.test(test)),
    )
    this.note("module.end", { file: this.file(module), state: module.state() })
    this.checkpoint()
  }
  onTestRunEnd: NonNullable<Reporter["onTestRunEnd"]> = (_modules, errors, reason) => {
    this.ended = true
    this.errors = errors.length
    this.reason = reason
    this.note("run.end", { errors: errors.length, reason })
    this.checkpoint()
  }
}
