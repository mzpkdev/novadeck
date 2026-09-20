import { execFileSync } from "node:child_process"

import { analyzeRelease } from "../plan/plan.ts"
import { parseVersion } from "../version/version.ts"

type Environment = Record<string, string | undefined>

interface Release {
  draft: boolean
  tag_name: string
}

interface TurnOptions {
  directory?: string
  pause?: () => Promise<void>
  refresh?: (directory: string) => void
}

const git = (args: string[], directory: string): string =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim()

const message = (sha: string, directory: string): string =>
  git(["log", "-1", "--format=%B", sha], directory)

export const previousReleaseCommit = (directory = process.cwd()): string | null => {
  const head = git(["rev-parse", "HEAD"], directory)
  if (!analyzeRelease([message(head, directory)])) return null

  const history = git(["rev-list", "--reverse", `${head}^`], directory)
  if (!history) return null

  return (
    history
      .split("\n")
      .filter((sha) => analyzeRelease([message(sha, directory)]))
      .at(-1) ?? null
  )
}

const tagsAt = (sha: string, directory: string): string[] =>
  git(["tag", "--points-at", sha, "--list"], directory)
    .split("\n")
    .filter((tag) => parseVersion(tag))

const readRelease = async (
  api: string,
  repo: string,
  tag: string,
  token: string,
): Promise<Release | null> => {
  const response = await fetch(`${api}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`)

  const value: unknown = await response.json()
  if (
    !value ||
    typeof value !== "object" ||
    !("draft" in value) ||
    typeof value.draft !== "boolean" ||
    !("tag_name" in value) ||
    typeof value.tag_name !== "string"
  ) {
    throw new Error("Release response is invalid.")
  }
  return value as Release
}

export const waitForReleaseTurn = async (
  env: Environment,
  options: TurnOptions = {},
): Promise<void> => {
  const directory = options.directory ?? process.cwd()
  const previous = previousReleaseCommit(directory)
  if (!previous) return

  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const token = env.GH_TOKEN
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    throw new Error("Missing repository or token.")
  }

  const pause = options.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 60_000)))
  const refresh = options.refresh ?? ((cwd) => void git(["fetch", "--force", "--tags", "origin"], cwd))

  while (true) {
    refresh(directory)
    for (const tag of tagsAt(previous, directory)) {
      const release = await readRelease(api, repo, tag, token)
      if (release && !release.draft && release.tag_name === tag) return
    }

    console.log(`Waiting for the release at ${previous} to be published.`)
    await pause()
  }
}
