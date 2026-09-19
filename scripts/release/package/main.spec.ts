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

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "novadeck-package-"))
    output = join(directory, "output")
    previousDirectory = process.cwd()
    previousOutput = process.env.GITHUB_OUTPUT
    process.chdir(directory)
    process.env.GITHUB_OUTPUT = output
  })

  afterEach(() => {
    process.chdir(previousDirectory)
    if (previousOutput === undefined) delete process.env.GITHUB_OUTPUT
    else process.env.GITHUB_OUTPUT = previousOutput
    rmSync(directory, { force: true, recursive: true })
  })

  context("when package.json has a version", () => {
    it("publishes the packaging outputs", () => {
      writeFileSync("package.json", JSON.stringify({ version: "0.0.0" }))

      main()

      expect(readFileSync(output, "utf8")).toBe("package=true\nversion=0.0.0\n")
    })
  })

  context("when package.json has no version", () => {
    it("fails without publishing outputs", () => {
      writeFileSync("package.json", "{}")

      expect(() => main()).toThrow("package.json version is missing")
    })
  })
})
