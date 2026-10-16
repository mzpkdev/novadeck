import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import type { TestProjectInlineConfiguration, ViteUserConfig } from "vitest/config"
import type { BrowserCommandContext, Reporter } from "vitest/node"

import { uninstallConfig } from "./uninstall-config.mts"

const folders: string[] = []
const folder = () => {
  const path = mkdtempSync(join(tmpdir(), "uninstall-config-"))
  folders.push(path)
  return path
}
afterEach(() => folders.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })))
const base = (): ViteUserConfig => ({
  test: {
    restoreMocks: true,
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"], testTimeout: 20_000 } },
      {
        extends: true,
        test: {
          name: "behaviour",
          include: ["src/specs/**/*.spec.tsx"],
          exclude: ["motion"],
          setupFiles: ["./src/specs/setup.ts"],
          testTimeout: 30_000,
          browser: { enabled: true, screenshotFailures: true, commands: { pinPointer: () => {} } },
        },
      },
      { extends: true, test: { name: "motion", include: ["motion"], testTimeout: 30_000 } },
    ],
  },
})
const projects = (config: ViteUserConfig) =>
  config.test!.projects as TestProjectInlineConfiguration[]

describe("uninstall capture config scopes", () => {
  it("keeps all Quality projects, selection, setup, scheduling, deadlines and native commands", () => {
    const original = base()
    const captured = uninstallConfig(original, folder(), "quality")
    for (const [index, project] of projects(original).entries()) {
      const observed = projects(captured)[index]!
      for (const key of [
        "include",
        "exclude",
        "setupFiles",
        "testTimeout",
        "fileParallelism",
        "isolate",
      ] as const)
        expect(observed.test?.[key]).toEqual(project.test?.[key])
    }
    expect(projects(captured)).toHaveLength(3)
    expect(projects(captured)[1]!.test!.browser!.commands!.pinPointer).toBe(
      projects(original)[1]!.test!.browser!.commands!.pinPointer,
    )
    expect(projects(captured)[1]!.test!.browser!.trace).toBeUndefined()
    expect(original.test!.reporters).toBeUndefined()
  })

  it("preserves isolated file mode and limits the extra setup to its single project", () => {
    const captured = uninstallConfig(base(), folder(), "file")
    expect(projects(captured)).toHaveLength(1)
    expect(projects(captured)[0]!.test!.include).toEqual(["src/specs/uninstall.spec.tsx"])
    expect(projects(captured)[0]!.test!.setupFiles).toHaveLength(2)
    expect(projects(captured)[0]!.test!.browser!.trace).toMatchObject({ mode: "retain-on-failure" })
    expect(captured.test!.reporters).toBeUndefined()
  })

  it("fails closed without output or if the original project boundary changes", () => {
    expect(() => uninstallConfig(base(), undefined, "quality")).toThrow("Run uninstall")
    const changed = base()
    projects(changed).pop()
    expect(() => uninstallConfig(changed, folder(), "quality")).toThrow("project boundary")
  })

  it("rejects unrelated writer calls and namespaces the target timeline", async () => {
    const output = folder()
    const captured = uninstallConfig(base(), output, "quality")
    const write = projects(captured)[1]!.test!.browser!.commands!.uninstallSourceTimeline!
    const context = {
      testPath: "/checkout/src/specs/other.spec.tsx",
      project: { name: "behaviour" },
    } as BrowserCommandContext
    await expect(write(context, { total: 0, dropped: 0, events: [] })).rejects.toThrow("outside")
    context.testPath = "/checkout/src/specs/uninstall.spec.tsx"
    await write(context, { total: 1, dropped: 0, events: [{ stage: "result" }] })
    expect(
      JSON.parse(readFileSync(join(output, "behaviour/uninstall/source-events.json"), "utf8")),
    ).toMatchObject({ total: 1 })
  })

  it("records actual module starts rather than config loading as execution proof", async () => {
    const output = folder()
    const captured = uninstallConfig(base(), output, "quality")
    const reporters = captured.test!.reporters
    if (!Array.isArray(reporters)) throw new Error("Missing reporter array")
    const reporter = reporters[2] as Reporter
    const module = {
      moduleId: "/checkout/src/specs/uninstall.spec.tsx",
      project: { name: "behaviour" },
    }
    // Only the reporter boundary is simulated; this test never invokes Vitest or a browser.
    reporter.onTestModuleStart!(module as Parameters<NonNullable<Reporter["onTestModuleStart"]>>[0])
    await reporter.onTestRunEnd!([], [], "passed")
    expect(JSON.parse(readFileSync(join(output, "ui-execution.json"), "utf8"))).toMatchObject({
      finished: true,
      total: 1,
      dropped: 0,
      modules: [{ file: module.moduleId, project: "behaviour" }],
    })
  })
})
