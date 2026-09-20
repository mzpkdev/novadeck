import { HttpResponse, http } from "msw"
import { vi } from "vitest"

import { server } from "../../../src/renderer/src/test/server"
import { context, describe, expect, it } from "../../../src/test"
import { previousRun, readWorkflowRuns, waitForTurn } from "./queue"

const env = {
  GH_TOKEN: "fixture-token",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REPOSITORY: "test/consumer",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_ID: "300",
  GITHUB_RUN_NUMBER: "30",
}

const run = (
  id: number,
  number: number,
  status = "in_progress",
  conclusion: string | null = status === "completed" ? "success" : null,
) => ({
  conclusion,
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
              { workflow_runs: [run(290, 29)] },
              {
                headers: {
                  link: '<https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs?page=3>; rel="next"',
                },
              },
            )
          }

          return HttpResponse.json(
            { workflow_runs: [run(300, 30), run(280, 28, "completed")] },
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
      run(280, 28, "completed"),
      run(290, 29),
    ])
    expect(requests).toHaveBeenCalledTimes(2)
  })

  it("remembers a predecessor found before the current run", async () => {
    const requests = vi.fn()
    server.use(
      http.get(
        "https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs",
        ({ request }) => {
          requests()
          const page = new URL(request.url).searchParams.get("page")
          if (page === "2") {
            return HttpResponse.json(
              { workflow_runs: [run(300, 30)] },
              {
                headers: {
                  link: '<https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs?page=3>; rel="next"',
                },
              },
            )
          }

          return HttpResponse.json(
            { workflow_runs: [run(290, 29)] },
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
      run(290, 29),
      run(300, 30),
    ])
    expect(requests).toHaveBeenCalledTimes(2)
  })

  it("finishes pagination when the direct predecessor was deleted", async () => {
    const requests = vi.fn()
    server.use(
      http.get(
        "https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs",
        ({ request }) => {
          requests()
          const page = Number(new URL(request.url).searchParams.get("page") ?? "1")
          const runs = page === 1 ? [run(300, 30), run(280, 28, "completed")] : []
          if (page === 11) return HttpResponse.json({ workflow_runs: runs })

          return HttpResponse.json(
            { workflow_runs: runs },
            {
              headers: {
                link: `<https://api.github.test/repos/test/consumer/actions/workflows/release.yml/runs?page=${page + 1}>; rel="next"`,
              },
            },
          )
        },
      ),
    )

    const runs = await readWorkflowRuns(env, 300, 30)

    expect(previousRun(runs, 300, 30)).toEqual(run(280, 28, "completed"))
    expect(requests).toHaveBeenCalledTimes(11)
  })

  context("when workflow runs overlap", () => {
    it("selects the immediately preceding run", () => {
      expect(
        previousRun(
          [run(280, 28), run(290, 29, "completed"), run(300, 30), run(400, 40)],
          300,
          30,
        ),
      ).toEqual(run(290, 29, "completed"))
    })

    it("polls only the immediately preceding run until it completes", async () => {
      const pause = vi.fn(async () => undefined)
      respond([run(290, 29), run(300, 30)], run(290, 29, "completed"))

      await waitForTurn(env, pause)

      expect(pause).toHaveBeenCalledOnce()
    })

    it("waits for the closest surviving run when the predecessor is missing", async () => {
      const pause = vi.fn(async () => undefined)
      respond([run(280, 28), run(300, 30)], run(280, 28, "completed"))

      await waitForTurn(env, pause)

      expect(pause).toHaveBeenCalledOnce()
    })
  })

  context("when the GitHub API is not ready", () => {
    it("fails closed until the current run is visible", async () => {
      const pause = vi.fn(async () => respond([run(300, 1)]))
      respond([])

      await waitForTurn({ ...env, GITHUB_RUN_NUMBER: "1" }, pause)

      expect(pause).toHaveBeenCalledOnce()
    })

    it("allows the first automatic release when no earlier push run exists", async () => {
      respond([run(300, 30)])

      await expect(waitForTurn(env)).resolves.toBeUndefined()
    })
  })

  context("when the workflow was started manually", () => {
    it("does not enter the automatic release queue", async () => {
      await expect(
        waitForTurn({ ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }),
      ).resolves.toBeUndefined()
    })
  })

  context("when GitHub reruns an old workflow run", () => {
    it("allows recovery after newer runs have completed", async () => {
      respond([run(290, 29, "completed"), run(300, 30), run(310, 31, "completed")])

      await expect(
        waitForTurn({ ...env, GITHUB_RUN_ATTEMPT: "2" }),
      ).resolves.toBeUndefined()
    })

    it("rejects recovery while a newer run is active", async () => {
      respond([run(290, 29, "completed"), run(300, 30), run(310, 31)])

      await expect(waitForTurn({ ...env, GITHUB_RUN_ATTEMPT: "2" })).rejects.toThrow(
        "newer release run(s) are active",
      )
    })
  })

  context("when an earlier release failed", () => {
    it("fails closed until that run is recovered", async () => {
      respond([run(290, 29, "completed", "failure"), run(300, 30)])

      await expect(waitForTurn(env)).rejects.toThrow("rerun it successfully first")
    })
  })
})
