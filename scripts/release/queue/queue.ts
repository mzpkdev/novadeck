type Environment = Record<string, string | undefined>

interface WorkflowRun {
  id: number
  run_number: number
  status: string
}

interface WorkflowRuns {
  workflow_runs: WorkflowRun[]
}

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

const readPage = async (
  url: string,
  token: string,
  currentId: number,
  currentNumber: number,
  page = 1,
  foundCurrent = false,
): Promise<WorkflowRun[]> => {
  const response = await request(url, token)
  const runs = parseRuns(await response.json())
  const next = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1]
  const hasCurrent = foundCurrent || runs.some((run) => run.id === currentId)
  const hasPrevious = runs.some((run) => run.run_number === currentNumber - 1)

  if (!next || (hasCurrent && hasPrevious)) return runs
  if (page >= 10) throw new Error("Current release run was not found within 10 API pages.")

  return [
    ...runs,
    ...(await readPage(next, token, currentId, currentNumber, page + 1, hasCurrent)),
  ]
}

export const readWorkflowRuns = async (
  env: Environment,
  currentId: number,
  currentNumber: number,
): Promise<WorkflowRun[]> => {
  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const token = env.GH_TOKEN
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    throw new Error("Missing repository or token.")
  }

  const url = `${api}/repos/${repo}/actions/workflows/release.yml/runs?per_page=100&exclude_pull_requests=true`
  return readPage(url, token, currentId, currentNumber)
}

export const previousRun = (
  runs: WorkflowRun[],
  currentId: number,
  currentNumber: number,
): WorkflowRun | null =>
  runs.find((run) => run.id !== currentId && run.run_number === currentNumber - 1) ?? null

export const readWorkflowRun = async (
  env: Environment,
  runId: number,
): Promise<WorkflowRun> => {
  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const token = env.GH_TOKEN
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    throw new Error("Missing repository or token.")
  }

  const response = await request(`${api}/repos/${repo}/actions/runs/${runId}`, token)
  const run: unknown = await response.json()
  return parseRuns({ workflow_runs: [run] })[0]!
}

export const waitForTurn = async (
  env: Environment,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 120_000)),
): Promise<void> => {
  const currentId = Number(env.GITHUB_RUN_ID)
  const currentNumber = Number(env.GITHUB_RUN_NUMBER)
  const currentAttempt = Number(env.GITHUB_RUN_ATTEMPT)
  if (
    !Number.isSafeInteger(currentId) ||
    !Number.isSafeInteger(currentNumber) ||
    !Number.isSafeInteger(currentAttempt)
  ) {
    throw new Error("Missing current workflow run identity.")
  }
  if (currentAttempt !== 1) {
    throw new Error("Release workflow reruns are disabled because they cannot preserve FIFO order.")
  }

  let previous: WorkflowRun | null = null
  while (!previous) {
    const runs = await readWorkflowRuns(env, currentId, currentNumber)
    const current = runs.some((run) => run.id === currentId)
    if (!current) {
      console.log("Current run is not visible yet; waiting before retrying.")
      await pause()
      continue
    }

    previous = previousRun(runs, currentId, currentNumber)
    if (!previous || previous.status === "completed") return
  }

  while (previous.status !== "completed") {
    console.log(`Waiting for earlier release run ${previous.id}.`)
    await pause()
    previous = await readWorkflowRun(env, previous.id)
  }
}
