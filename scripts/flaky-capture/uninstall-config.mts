import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import type { TestProjectInlineConfiguration, ViteUserConfig } from "vitest/config"
import type { Reporter } from "vitest/node"

import { instrumentUninstall } from "./uninstall-instrument.js"
import type { UninstallCapture, UninstallExecution } from "./uninstall-results.ts"

const root = fileURLToPath(new URL("../../application/ui/", import.meta.url))
const repo = fileURLToPath(new URL("../../", import.meta.url))
const target = "src/specs/uninstall.spec.tsx"
const events = fileURLToPath(new URL("./uninstall-events.mjs", import.meta.url))
const setup = fileURLToPath(new URL("./uninstall.setup.mjs", import.meta.url))
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")
const json = (file: string, value: unknown) =>
  writeFile(file, JSON.stringify(value, null, 2) + "\n")

type Sources = { total: number; dropped: number; events: unknown[] }
type Capture = UninstallCapture & { index: number; sources: Sources }
type Context = {
  testPath?: string | undefined
  project: { name: string }
  page?: {
    context(): { browser(): { version(): string } | null }
    viewportSize(): { width: number; height: number } | null
  }
}

export const uninstallConfig = (
  base: ViteUserConfig,
  output: string | undefined,
  scope: "file" | "quality",
): ViteUserConfig => {
  if (!output) throw new Error("Run uninstall capture through scripts/flaky-capture/uninstall.ts")
  const projects = base.test?.projects
  if (!projects || projects.some((project) => typeof project !== "object" || !("test" in project)))
    throw new Error("Uninstall capture needs the original inline UI projects")
  const inline = projects as TestProjectInlineConfiguration[]
  if (inline.map((project) => project.test?.name).join(",") !== "unit,behaviour,motion")
    throw new Error("Uninstall capture UI project boundary changed")
  const quality = scope === "quality"
  const records = quality ? join(output, "behaviour", "uninstall") : output
  mkdirSync(join(output, "transforms"), { recursive: true })
  mkdirSync(records, { recursive: true })
  const verify = (context: Context) => {
    if (
      quality &&
      (!context.testPath?.replaceAll("\\", "/").endsWith(`/${target}`) ||
        !/^behaviour(?: \(chromium\))?$/.test(context.project.name))
    )
      throw new Error("Uninstall writer called outside the target behaviour spec")
  }
  const commands = {
    uninstallCapture: async (context: Context, capture: Capture) => {
      verify(context)
      if (!Number.isInteger(capture.index) || capture.index < 1 || capture.index > 100)
        throw new Error("Invalid uninstall capture case index")
      const { sources, ...record } = capture
      await json(join(records, `case-${String(capture.index).padStart(2, "0")}.json`), {
        ...record,
        sourceTotal: sources.total,
        sourceDropped: sources.dropped,
      })
      await json(join(records, "source-events.json"), sources)
      await json(join(records, "browser.json"), {
        version: context.page?.context().browser()?.version(),
        viewport: context.page?.viewportSize(),
      })
    },
    uninstallSourceTimeline: async (context: Context, sources: Sources) => {
      verify(context)
      await json(join(records, "source-events.json"), { ...sources, finalFlush: true })
    },
  }
  const execution: UninstallExecution = {
    pid: process.pid,
    began: Date.now(),
    finished: false,
    total: 0,
    dropped: 0,
    modules: [],
  }
  const reporter: Reporter = {
    onTestModuleStart(module) {
      execution.total += 1
      if (execution.modules.length < 1000)
        execution.modules.push({
          file: module.moduleId.replaceAll("\\", "/"),
          project: module.project.name,
          started: Date.now(),
        })
      else execution.dropped += 1
    },
    async onTestRunEnd() {
      execution.finished = true
      await json(join(output, "ui-execution.json"), execution)
    },
  }
  if (quality)
    writeFileSync(
      join(output, "ui-config.json"),
      JSON.stringify(
        {
          scope,
          pid: process.pid,
          projects: inline.map((project) => ({
            name: project.test?.name,
            include: project.test?.include,
            exclude: project.test?.exclude,
            testTimeout: project.test?.testTimeout,
            setupFiles: project.test?.setupFiles,
            isolate: project.test?.isolate ?? "default",
            fileParallelism: project.test?.fileParallelism ?? "default",
          })),
        },
        null,
        2,
      ) + "\n",
    )
  return {
    ...base,
    root,
    server: { ...base.server, fs: { allow: [repo, output] } },
    plugins: [
      ...(base.plugins ?? []),
      {
        name: "uninstall-capture-boundaries",
        enforce: "pre",
        transform(source, id) {
          const result = instrumentUninstall(source, id, events, quality ? setup : undefined)
          if (!result) return undefined
          writeFileSync(
            join(output, "transforms", `${result.name}.json`),
            JSON.stringify(
              {
                file: result.file,
                incomingSourceSha256: sha256(source),
                transformedSourceSha256: sha256(result.code),
              },
              null,
              2,
            ) + "\n",
          )
          return result.code
        },
      },
    ],
    test: {
      ...base.test,
      attachmentsDir: join(output, "attachments"),
      ...(quality
        ? {
            reporters: ["default", "json", reporter],
            outputFile: { json: join(output, "tests.json") },
          }
        : {}),
      projects: inline
        .filter((project) => quality || project.test?.name === "behaviour")
        .map((project) => {
          if (project.test?.name !== "behaviour") return project
          return {
            ...project,
            test: {
              ...project.test,
              ...(!quality
                ? {
                    include: [target],
                    setupFiles: [...(project.test.setupFiles ?? []), setup],
                  }
                : {}),
              browser: {
                ...project.test.browser,
                ...(!quality
                  ? {
                      screenshotFailures: true,
                      trace: { mode: "retain-on-failure", tracesDir: join(output, "traces") },
                    }
                  : {}),
                commands: { ...project.test.browser?.commands, ...commands },
              },
            },
          }
        }),
    },
  }
}
