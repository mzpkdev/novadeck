import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "../../../src/test"
import { readTags } from "./main"

const git = (directory: string, ...args: string[]): void => {
  execFileSync("git", args, { cwd: directory })
}

describe("release tag discovery", () => {
  it("ignores version tags that are not merged into the release commit", () => {
    const directory = mkdtempSync(join(tmpdir(), "novadeck-release-plan-"))

    try {
      git(directory, "init", "--initial-branch=main")
      git(directory, "config", "user.email", "test@example.com")
      git(directory, "config", "user.name", "NovaDeck Test")
      writeFileSync(join(directory, "main.txt"), "main\n")
      git(directory, "add", "main.txt")
      git(directory, "commit", "-m", "feat: initialize main")
      git(directory, "tag", "v0.1.0")

      git(directory, "checkout", "-b", "feature")
      writeFileSync(join(directory, "feature.txt"), "feature\n")
      git(directory, "add", "feature.txt")
      git(directory, "commit", "-m", "feat: add unmerged work")
      git(directory, "tag", "v99.0.0")
      git(directory, "checkout", "main")

      expect(readTags(directory)).toEqual(["v0.1.0"])
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})
