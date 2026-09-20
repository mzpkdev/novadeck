import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach } from "vitest"

import { context, describe, expect, it } from "../../../src/test"
import { main } from "./main"

describe("manual release packaging entry point", () => {
  let directory: string
  let output: string
  let previousDirectory: string
  let previousOutput: string | undefined
  let previousRun: string | undefined

  const git = (...args: string[]): void => {
    execFileSync("git", args)
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "novadeck-package-"))
    output = join(directory, "output")
    previousDirectory = process.cwd()
    previousOutput = process.env.GITHUB_OUTPUT
    previousRun = process.env.GITHUB_RUN_NUMBER
    process.chdir(directory)
    process.env.GITHUB_OUTPUT = output
    process.env.GITHUB_RUN_NUMBER = "42"
    git("init", "--initial-branch=main")
    git("config", "user.email", "test@example.com")
    git("config", "user.name", "NovaDeck Test")
    writeFileSync("history.txt", "initial\n")
    git("add", "history.txt")
    git("commit", "-m", "chore: initialize")
  })

  afterEach(() => {
    process.chdir(previousDirectory)
    if (previousOutput === undefined) delete process.env.GITHUB_OUTPUT
    else process.env.GITHUB_OUTPUT = previousOutput
    if (previousRun === undefined) delete process.env.GITHUB_RUN_NUMBER
    else process.env.GITHUB_RUN_NUMBER = previousRun
    rmSync(directory, { force: true, recursive: true })
  })

  context("when package.json has a version", () => {
    it("marks an untagged source as a unique manual build", () => {
      writeFileSync("package.json", JSON.stringify({ version: "0.0.0" }))

      main()

      expect(readFileSync(output, "utf8")).toBe(
        "package=true\nversion=0.0.0-manual.42\n",
      )
    })

    it("uses the release version when packaging its exact tagged source", () => {
      writeFileSync("package.json", JSON.stringify({ version: "0.0.0" }))
      git("tag", "v0.4.2")

      main()

      expect(readFileSync(output, "utf8")).toBe("package=true\nversion=0.4.2\n")
    })

    it("bases a later manual build on the latest reachable release", () => {
      writeFileSync("package.json", JSON.stringify({ version: "0.0.0" }))
      git("tag", "v0.4.2")
      writeFileSync("history.txt", "later\n")
      git("add", "history.txt")
      git("commit", "-m", "docs: explain packaging")

      main()

      expect(readFileSync(output, "utf8")).toBe(
        "package=true\nversion=0.4.2-manual.42\n",
      )
    })
  })

  context("when package.json has no version", () => {
    it("fails without publishing outputs", () => {
      writeFileSync("package.json", "{}")

      expect(() => main()).toThrow("package.json version is missing")
    })
  })
})
