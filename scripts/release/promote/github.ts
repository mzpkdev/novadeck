type Environment = Record<string, string | undefined>

export const readLatestStableTag = async (env: Environment): Promise<string | null> => {
  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const repo = env.GITHUB_REPOSITORY
  const token = env.GH_TOKEN
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) {
    throw new Error("Missing repository or token.")
  }

  const response = await fetch(`${api}/repos/${repo}/releases/latest`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}.`)

  const release: unknown = await response.json()
  if (!release || typeof release !== "object" || !("tag_name" in release)) {
    throw new Error("Latest release response is invalid.")
  }
  if (typeof release.tag_name !== "string") {
    throw new Error("Latest release tag is invalid.")
  }

  return release.tag_name
}
