import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { HttpResponse, http } from "msw"

import { server } from "../../../src/renderer/src/test/server"
import { describe, expect, it } from "../../../src/test"
import { dispatchNextRelease } from "./advance"

const git = (directory: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim()

const commit = (directory: string, message: string): string => {
  writeFileSync(join(directory, "history.txt"), `${message}\n`, { flag: "a" })
  git(directory, "add", "history.txt")
  git(directory, "commit", "-m", message)
  return git(directory, "rev-parse", "HEAD")
}

describe("release advancement", () => {
  it("dispatches the nearest unpublished release-worthy commit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "novadeck-release-advance-"))
    try {
      git(directory, "init", "--initial-branch=main")
      git(directory, "config", "user.email", "test@example.com")
      git(directory, "config", "user.name", "NovaDeck Test")
      const source = commit(directory, "fix: first release")
      git(directory, "tag", "v0.0.0", source)
      commit(directory, "docs: explain releases")
      const next = commit(directory, "feat: second release")
      git(directory, "remote", "add", "origin", directory)
      let payload: unknown
      server.use(
        http.get("https://api.github.test/repos/test/consumer/releases/tags/v0.0.0", () =>
          HttpResponse.json({ draft: false, tag_name: "v0.0.0" }),
        ),
        http.post(
          "https://api.github.test/repos/test/consumer/dispatches",
          async ({ request }) => {
            payload = await request.json()
            return new HttpResponse(null, { status: 204 })
          },
        ),
      )

      await expect(
        dispatchNextRelease(
          {
            GH_TOKEN: "fixture-token",
            GITHUB_API_URL: "https://api.github.test",
            GITHUB_REPOSITORY: "test/consumer",
            SOURCE_SHA: source,
          },
          directory,
        ),
      ).resolves.toBe(next)
      expect(payload).toEqual({ client_payload: { sha: next }, event_type: "release" })
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})
