import { execFileSync } from "node:child_process"

import { analyzeRelease } from "../plan/plan.ts"
import { publishedReleaseAt } from "../queue/queue.ts"

type Environment = Record<string, string | undefined>

const git = (args: string[], directory: string): string =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim()

const message = (sha: string, directory: string): string =>
  git(["log", "-1", "--format=%B", sha], directory)

export const laterReleaseCommits = (source: string, directory = process.cwd()): string[] => {
  try {
    git(["merge-base", "--is-ancestor", source, "HEAD"], directory)
  } catch {
    throw new Error(`${source} is not an ancestor of main.`)
  }

  const history = git(["rev-list", "--reverse", "--first-parent", `${source}..HEAD`], directory)
  if (!history) return []

  return history
    .split("\n")
    .filter((sha) => analyzeRelease([message(sha, directory)]))
}

const dispatch = async (
  api: string,
  repo: string,
  sha: string,
  token: string,
): Promise<void> => {
  const response = await fetch(`${api}/repos/${repo}/dispatches`, {
    body: JSON.stringify({ client_payload: { sha }, event_type: "release" }),
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`)
}

export const dispatchNextRelease = async (
  env: Environment,
  directory = process.cwd(),
): Promise<string | null> => {
  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const source = env.SOURCE_SHA
  const token = env.GH_TOKEN
  if (
    !repo ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !source ||
    !/^[0-9a-f]{40}$/.test(source) ||
    !token
  ) {
    throw new Error("Missing repository, source commit, or token.")
  }

  git(["fetch", "--force", "--tags", "origin"], directory)
  const options = { directory, refresh: () => undefined }
  if (!(await publishedReleaseAt(source, env, options))) return null

  for (const sha of laterReleaseCommits(source, directory)) {
    if (await publishedReleaseAt(sha, env, options)) continue

    await dispatch(api, repo, sha, token)
    return sha
  }
  return null
}
