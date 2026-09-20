import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { HttpResponse, http } from "msw"
import { vi } from "vitest"

import { server } from "../../../src/renderer/src/test/server"
import { context, describe, expect, it } from "../../../src/test"
import { previousReleaseCommit, waitForReleaseTurn } from "./queue"

const env = {
  GH_TOKEN: "fixture-token",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_REPOSITORY: "test/consumer",
}

const git = (directory: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim()

const commit = (directory: string, message: string): string => {
  writeFileSync(join(directory, "history.txt"), `${message}\n`, { flag: "a" })
  git(directory, "add", "history.txt")
  git(directory, "commit", "-m", message)
  return git(directory, "rev-parse", "HEAD")
}

const repository = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "novadeck-release-queue-"))
  git(directory, "init", "--initial-branch=main")
  git(directory, "config", "user.email", "test@example.com")
  git(directory, "config", "user.name", "NovaDeck Test")
  return directory
}

describe("release order", () => {
  context("when examining commit history", () => {
    it("finds the nearest earlier release-worthy commit", () => {
      const directory = repository()
      try {
        commit(directory, "fix: first release")
        const previous = commit(directory, "feat: second release")
        commit(directory, "docs: explain releases")
        commit(directory, "fix: current release")

        expect(previousReleaseCommit(directory)).toBe(previous)
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    })

    it("does not release from a maintenance commit", () => {
      const directory = repository()
      try {
        commit(directory, "fix: failed release")
        commit(directory, "docs: explain releases")

        expect(previousReleaseCommit(directory)).toBeNull()
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    })
  })

  context("when an earlier release-worthy commit exists", () => {
    it("waits until its tagged release is published", async () => {
      const directory = repository()
      try {
        const previous = commit(directory, "fix: first release")
        git(directory, "tag", "v0.0.0", previous)
        commit(directory, "fix: second release")
        let draft = true
        server.use(
          http.get("https://api.github.test/repos/test/consumer/releases/tags/v0.0.0", () =>
            HttpResponse.json({ draft, tag_name: "v0.0.0" }),
          ),
        )
        const pause = vi.fn(async () => {
          draft = false
        })

        await waitForReleaseTurn(env, { directory, pause, refresh: () => undefined })

        expect(pause).toHaveBeenCalledOnce()
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    })
  })
})
