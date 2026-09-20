import { execFileSync } from "node:child_process"

import { analyzeRelease } from "../plan/plan.ts"
import { parseVersion } from "../version/version.ts"

type Environment = Record<string, string | undefined>

interface Release {
  body: string | null
  draft: boolean
  id: number
  tag_name: string
  target_commitish: string
}

const marker = "<!-- novadeck-automatic-release -->"

const git = (args: string[], directory: string): string =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim()

const request = async (
  url: string,
  token: string,
  method = "GET",
): Promise<Response> =>
  fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    method,
    signal: AbortSignal.timeout(15_000),
  })

const readRelease = async (
  api: string,
  repo: string,
  tag: string,
  token: string,
): Promise<Release | null> => {
  const response = await request(
    `${api}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    token,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`)

  const value: unknown = await response.json()
  if (
    !value ||
    typeof value !== "object" ||
    !("body" in value) ||
    (value.body !== null && typeof value.body !== "string") ||
    !("draft" in value) ||
    typeof value.draft !== "boolean" ||
    !("id" in value) ||
    typeof value.id !== "number" ||
    !("tag_name" in value) ||
    typeof value.tag_name !== "string" ||
    !("target_commitish" in value) ||
    typeof value.target_commitish !== "string"
  ) {
    throw new Error("Release response is invalid.")
  }
  return value as Release
}

const remove = async (url: string, token: string): Promise<void> => {
  const response = await request(url, token, "DELETE")
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`)
}

export const recoverInterruptedRelease = async (
  env: Environment,
  directory = process.cwd(),
): Promise<string[]> => {
  const source = git(["rev-parse", "HEAD"], directory)
  const message = git(["log", "-1", "--format=%B"], directory)
  if (!analyzeRelease([message])) return []

  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const token = env.RELEASE_TOKEN
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    throw new Error("RELEASE_TOKEN must grant Contents and Workflows write access.")
  }

  const tags = git(["tag", "--points-at", source, "--list"], directory)
    .split("\n")
    .filter((tag) => parseVersion(tag))
  const recovered: string[] = []
  for (const tag of tags) {
    const release = await readRelease(api, repo, tag, token)
    if (!release) {
      throw new Error(`Refusing to remove ${tag}; it has no associated workflow draft.`)
    }
    if (!release.draft) continue
    if (
      release.tag_name !== tag ||
      release.target_commitish !== source ||
      !release.body?.includes(marker)
    ) {
      throw new Error(`Refusing to remove ${tag}; the workflow does not own its draft.`)
    }

    await remove(`${api}/repos/${repo}/releases/${release.id}`, token)
    await remove(`${api}/repos/${repo}/git/refs/tags/${encodeURIComponent(tag)}`, token)
    git(["tag", "--delete", tag], directory)
    recovered.push(tag)
  }
  return recovered
}
