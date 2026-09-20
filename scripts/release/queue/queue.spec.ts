import { HttpResponse, http } from "msw"
import { vi } from "vitest"

import { server } from "../../../src/renderer/src/test/server"
import { context, describe, expect, it } from "../../../src/test"
import { previousRun, readWorkflowRuns, waitForTurn } from "./queue"

const env = {
  GH_TOKEN: "fixture-token",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_REPOSITORY: "test/consumer",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_ID: "300",
  GITHUB_RUN_NUMBER: "30",
}

const run = (id: number, number: number, status = "in_progress") => ({
  id,
  run_number: number,
  status,
})

const respond = (
  runs: ReturnType<typeof run>[],
  updated: ReturnType<typeof run> | null = null,
): void => {
  server.use(
    http.get(
      "https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs",
      () => HttpResponse.json({ workflow_runs: runs }),
    ),
    http.get("https://api.github.test/repos/test/consumer/actions/runs/:runId", () =>
      HttpResponse.json(updated),
    ),
  )
}

describe("release queue", () => {
  it("stops reading pages after finding the current run and its predecessor", async () => {
    const requests = vi.fn()
    server.use(
      http.get(
        "https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs",
        ({ request }) => {
          requests()
          const page = new URL(request.url).searchParams.get("page")
          if (page === "2") {
            return HttpResponse.json(
              { workflow_runs: [run(200, 20)] },
              {
                headers: {
                  link: '<https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs?page=3>; rel="next"',
                },
              },
            )
          }

          return HttpResponse.json(
            { workflow_runs: [run(300, 30)] },
            {
              headers: {
                link: '<https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs?page=2>; rel="next"',
              },
            },
          )
        },
      ),
    )

    await expect(readWorkflowRuns(env, 300, 30)).resolves.toEqual([
      run(300, 30),
      run(200, 20),
    ])
    expect(requests).toHaveBeenCalledTimes(2)
  })

  context("when workflow runs overlap", () => {
    it("selects the immediately preceding run", () => {
      expect(
        previousRun(
          [run(100, 10), run(200, 20, "completed"), run(300, 30), run(400, 40)],
          300,
          30,
        ),
      ).toEqual(run(200, 20, "completed"))
    })

    it("polls only the immediately preceding run until it completes", async () => {
      const pause = vi.fn(async () => undefined)
      respond([run(200, 20), run(300, 30)], run(200, 20, "completed"))

      await waitForTurn(env, pause)

      expect(pause).toHaveBeenCalledOnce()
    })
  })

  context("when the GitHub API is not ready", () => {
    it("fails closed until the current run is visible", async () => {
      const pause = vi.fn(async () => respond([run(300, 30)]))
      respond([])

      await waitForTurn(env, pause)

      expect(pause).toHaveBeenCalledOnce()
    })
  })

  context("when GitHub reruns an old workflow run", () => {
    it("rejects the reused run number", async () => {
      await expect(waitForTurn({ ...env, GITHUB_RUN_ATTEMPT: "2" })).rejects.toThrow(
        "reruns are disabled",
      )
    })
  })
})
