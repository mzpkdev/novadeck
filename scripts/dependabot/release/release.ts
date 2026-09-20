type Environment = Record<string, string | undefined>

interface PullRequest {
  merge_commit_sha: string | null
  merged: boolean
  state: string
}

const request = async (
  url: string,
  token: string,
  init: Omit<RequestInit, "headers" | "signal"> = {},
): Promise<Response> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`)
  return response
}

const readPullRequest = async (url: string, token: string): Promise<PullRequest> => {
  const value: unknown = await (await request(url, token)).json()
  if (!value || typeof value !== "object") throw new Error("Pull request response is invalid.")
  if (
    !("merged" in value) ||
    typeof value.merged !== "boolean" ||
    !("state" in value) ||
    typeof value.state !== "string" ||
    !("merge_commit_sha" in value) ||
    (value.merge_commit_sha !== null && typeof value.merge_commit_sha !== "string")
  ) {
    throw new Error("Pull request response is invalid.")
  }

  return value as PullRequest
}

export const dispatchReleaseAfterMerge = async (
  env: Environment,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 10_000)),
): Promise<string> => {
  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const token = env.GH_TOKEN
  const number = env.PR_NUMBER
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token || !/^\d+$/.test(number ?? "")) {
    throw new Error("Missing repository, token, or pull request number.")
  }

  const root = `${api}/repos/${repo}`
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const pull = await readPullRequest(`${root}/pulls/${number}`, token)
    if (pull.merged && pull.merge_commit_sha) {
      await request(`${root}/dispatches`, token, {
        body: JSON.stringify({
          client_payload: { sha: pull.merge_commit_sha },
          event_type: "release",
        }),
        method: "POST",
      })
      return pull.merge_commit_sha
    }
    if (pull.state === "closed") throw new Error(`Pull request ${number} closed without merging.`)

    await pause()
  }

  throw new Error(`Timed out waiting for pull request ${number} to merge.`)
}
