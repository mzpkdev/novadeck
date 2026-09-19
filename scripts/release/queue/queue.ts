type Environment = Record<string, string | undefined>

interface WorkflowRun {
  id: number
  run_number: number
  status: string
}

interface WorkflowRuns {
  workflow_runs: WorkflowRun[]
}

const activeStatuses = ["requested", "waiting", "pending", "queued", "in_progress"] as const

const request = async (url: string, token: string): Promise<Response> => {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`)
  return response
}

const parseRuns = (value: unknown): WorkflowRun[] => {
  if (!value || typeof value !== "object" || !("workflow_runs" in value)) {
    throw new Error("Workflow runs response is invalid.")
  }

  const runs = (value as WorkflowRuns).workflow_runs
  if (!Array.isArray(runs)) throw new Error("Workflow runs response is invalid.")

  return runs.map((run) => {
    if (
      !run ||
      typeof run.id !== "number" ||
      typeof run.run_number !== "number" ||
      typeof run.status !== "string"
    ) {
      throw new Error("Workflow run is invalid.")
    }

    return run
  })
}

const readPage = async (url: string, token: string): Promise<WorkflowRun[]> => {
  const response = await request(url, token)
  const runs = parseRuns(await response.json())
  const next = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1]

  return next ? [...runs, ...(await readPage(next, token))] : runs
}

export const readActiveRuns = async (env: Environment): Promise<WorkflowRun[]> => {
  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const token = env.GH_TOKEN
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    throw new Error("Missing repository or token.")
  }

  const root = `${api}/repos/${repo}/actions/workflows/release.yml/runs?per_page=100`
  const pages = await Promise.all(
    activeStatuses.map((status) => readPage(`${root}&status=${status}`, token)),
  )

  return pages.flat()
}

export const earlierRuns = (
  runs: WorkflowRun[],
  currentId: number,
  currentNumber: number,
): WorkflowRun[] => runs.filter((run) => run.id !== currentId && run.run_number < currentNumber)

export const waitForTurn = async (
  env: Environment,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 15_000)),
): Promise<void> => {
  const currentId = Number(env.GITHUB_RUN_ID)
  const currentNumber = Number(env.GITHUB_RUN_NUMBER)
  if (!Number.isSafeInteger(currentId) || !Number.isSafeInteger(currentNumber)) {
    throw new Error("Missing current workflow run identity.")
  }

  while (true) {
    const runs = await readActiveRuns(env)
    if (!runs.some((run) => run.id === currentId)) {
      console.log("Current run is not visible yet; waiting before retrying.")
      await pause()
      continue
    }

    const blockers = earlierRuns(runs, currentId, currentNumber)
    if (blockers.length === 0) return

    console.log(`Waiting for earlier release run(s): ${blockers.map((run) => run.id).join(", ")}.`)
    await pause()
  }
}
