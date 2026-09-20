import { HttpResponse, http } from "msw"

import { server } from "../../../src/renderer/src/test/server"
import { context, describe, expect, it } from "../../../src/test"
import { readLatestStableTag } from "./github"

const env = {
  GH_TOKEN: "fixture-token",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_REPOSITORY: "test/consumer",
}

describe("latest stable release", () => {
  context("when a stable release exists", () => {
    it("returns its tag", async () => {
      server.use(
        http.get("https://api.github.test/repos/test/consumer/releases/latest", () =>
          HttpResponse.json({ tag_name: "v0.3.0" }),
        ),
      )

      await expect(readLatestStableTag(env)).resolves.toBe("v0.3.0")
    })
  })

  context("when the repository has no stable release", () => {
    it("returns null only for not found", async () => {
      server.use(
        http.get(
          "https://api.github.test/repos/test/consumer/releases/latest",
          () => new HttpResponse(null, { status: 404 }),
        ),
      )

      await expect(readLatestStableTag(env)).resolves.toBeNull()
    })
  })

  context("when GitHub is unavailable", () => {
    it("fails closed", async () => {
      server.use(
        http.get(
          "https://api.github.test/repos/test/consumer/releases/latest",
          () => new HttpResponse(null, { status: 429 }),
        ),
      )

      await expect(readLatestStableTag(env)).rejects.toThrow("GitHub API returned 429")
    })
  })
})
