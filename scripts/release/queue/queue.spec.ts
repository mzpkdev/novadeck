import { HttpResponse, http } from "msw"
import { vi } from "vitest"

import { server } from "../../../src/renderer/src/test/server"
import { context, describe, expect, it } from "../../../src/test"
import { earlierRuns, waitForTurn } from "./queue"

const env = {
  GH_TOKEN: "fixture-token",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_REPOSITORY: "test/consumer",
  GITHUB_RUN_ID: "300",
  GITHUB_RUN_NUMBER: "30",
}

const run = (id: number, number: number, status = "in_progress") => ({
  id,
  run_number: number,
  status,
})

const respond = (...runs: ReturnType<typeof run>[]): void => {
  server.use(
    http.get(
      "https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs",
      ({ request }) => {
        const status = new URL(request.url).searchParams.get("status")
        return HttpResponse.json({ workflow_runs: runs.filter((item) => item.status === status) })
      },
    ),
  )
}

describe("release queue", () => {
  context("when workflow runs overlap", () => {
    it("identifies only earlier active runs as blockers", () => {
      expect(earlierRuns([run(100, 10), run(300, 30), run(400, 40)], 300, 30)).toEqual([
        run(100, 10),
      ])
    })

    it("waits until every earlier run completes", async () => {
      const pause = vi.fn(async () => respond(run(300, 30)))
      respond(run(200, 20), run(300, 30))

      await waitForTurn(env, pause)

      expect(pause).toHaveBeenCalledOnce()
    })
  })

  context("when the GitHub API is not ready", () => {
    it("fails closed until the current run is visible", async () => {
      const pause = vi.fn(async () => respond(run(300, 30)))
      respond()

      await waitForTurn(env, pause)

      expect(pause).toHaveBeenCalledOnce()
    })
  })
})
