import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { HttpResponse, http } from "msw"

import { server } from "../../../src/renderer/src/test/server"
import { context, describe, expect, it } from "../../../src/test"
import { recoverInterruptedRelease } from "./recover"

const env = {
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_REPOSITORY: "test/consumer",
  RELEASE_TOKEN: "fixture-token",
}

const git = (directory: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim()

const repository = (): { directory: string; source: string } => {
  const directory = mkdtempSync(join(tmpdir(), "novadeck-release-recover-"))
  git(directory, "init", "--initial-branch=main")
  git(directory, "config", "user.email", "test@example.com")
  git(directory, "config", "user.name", "NovaDeck Test")
  writeFileSync(join(directory, "main.txt"), "main\n")
  git(directory, "add", "main.txt")
  git(directory, "commit", "-m", "fix: release source")
  git(directory, "tag", "v0.0.0")
  return { directory, source: git(directory, "rev-parse", "HEAD") }
}

describe("interrupted release recovery", () => {
  context("when a same-source draft remains", () => {
    it("removes the draft and its local and remote tag", async () => {
      const { directory, source } = repository()
      const deletions: string[] = []
      try {
        server.use(
          http.get("https://api.github.test/repos/test/consumer/releases/tags/v0.0.0", () =>
            HttpResponse.json({
              draft: true,
              id: 42,
              tag_name: "v0.0.0",
              target_commitish: source,
            }),
          ),
          http.delete("https://api.github.test/repos/test/consumer/releases/:id", ({ params }) => {
            deletions.push(`releases/${params.id}`)
            return new HttpResponse(null, { status: 204 })
          }),
          http.delete(
            "https://api.github.test/repos/test/consumer/git/refs/tags/:tag",
            ({ params }) => {
              deletions.push(`git/refs/tags/${params.tag}`)
              return new HttpResponse(null, { status: 204 })
            },
          ),
        )

        await expect(recoverInterruptedRelease(env, directory)).resolves.toEqual(["v0.0.0"])
        expect(deletions).toEqual(["releases/42", "git/refs/tags/v0.0.0"])
        expect(git(directory, "tag", "--list")).toBe("")
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    })
  })

  context("when the release is already published", () => {
    it("leaves the immutable release untouched", async () => {
      const { directory, source } = repository()
      try {
        server.use(
          http.get("https://api.github.test/repos/test/consumer/releases/tags/v0.0.0", () =>
            HttpResponse.json({
              draft: false,
              id: 42,
              tag_name: "v0.0.0",
              target_commitish: source,
            }),
          ),
        )

        await expect(recoverInterruptedRelease(env, directory)).resolves.toEqual([])
        expect(git(directory, "tag", "--list")).toBe("v0.0.0")
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    })
  })
})
