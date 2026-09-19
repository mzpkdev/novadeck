type Environment = Record<string, string | undefined>

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const hasChecks = (value: unknown): boolean => {
  const rule = object(value)
  return (
    (Array.isArray(rule.contexts) && rule.contexts.length > 0) ||
    (Array.isArray(rule.checks) && rule.checks.length > 0)
  )
}

export const hasRequiredChecks = (branch: unknown, rules: unknown): boolean => {
  const info = object(branch)
  const protection = object(info.protection)
  if (info.protected === true && hasChecks(protection.required_status_checks)) return true
  if (!Array.isArray(rules)) throw new Error("Branch rules response must be a list.")

  return rules.some((value) => {
    const rule = object(value)
    const parameters = object(rule.parameters)
    return (
      rule.type === "required_status_checks" &&
      Array.isArray(parameters.required_status_checks) &&
      parameters.required_status_checks.length > 0
    )
  })
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

const readRules = async (url: string, token: string): Promise<unknown[]> => {
  const response = await request(url, token)
  const page: unknown = await response.json()
  if (!Array.isArray(page)) throw new Error("Branch rules response must be a list.")

  const next = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1]
  return next ? [...page, ...(await readRules(next, token))] : page
}

export const ready = async (env: Environment): Promise<boolean> => {
  const repo = env.GITHUB_REPOSITORY
  const token = env.GH_TOKEN
  const base = env.BASE_REF
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token || !base) {
    throw new Error("Missing repository, token, or base branch.")
  }

  const api = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")
  const root = `${api}/repos/${repo}`
  const settings = object(await (await request(root, token)).json())
  if (settings.allow_auto_merge !== true || settings.allow_squash_merge !== true) return false

  const branch = encodeURIComponent(base)
  const info = await (await request(`${root}/branches/${branch}`, token)).json()
  if (hasRequiredChecks(info, [])) return true

  const rules = await readRules(`${root}/rules/branches/${branch}?per_page=100`, token)
  return hasRequiredChecks(info, rules)
}
