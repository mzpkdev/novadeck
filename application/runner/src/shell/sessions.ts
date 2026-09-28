import { open, readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"

import type { AgentName } from "@novadeck/protocol"

/** What a terminal's lost agent is looked for by: its directory and when it started. */
export type SessionSearch = {
  readonly cwd: string
  /** The agent started after this moment, in epoch milliseconds: the shell's last prompt. */
  readonly since: number
  /** Sessions other terminals reported, which are theirs. */
  readonly exclude: ReadonlySet<string>
  readonly env?: NodeJS.ProcessEnv
  readonly home?: string
}

// Clocks and file times differ a little; a session this much older still counts.
const slackMs = 2_000
// Codex files sessions under local dates; an agent older than this is not looked for.
const maxDays = 7
const headBytes = 64 * 1024

const head = async (path: string): Promise<string[]> => {
  const file = await open(path, "r")
  try {
    const buffer = Buffer.alloc(headBytes)
    const { bytesRead } = await file.read(buffer, 0, headBytes, 0)
    return buffer.subarray(0, bytesRead).toString("utf8").split("\n").slice(0, 16)
  } finally {
    await file.close()
  }
}

const json = (line: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(line)
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

const same = (a: unknown, b: string): boolean => typeof a === "string" && resolve(a) === resolve(b)

const recent = async (path: string, since: number): Promise<boolean> => {
  try {
    return (await stat(path)).mtimeMs >= since - slackMs
  } catch {
    return false
  }
}

const list = async (directory: string): Promise<string[]> => {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".jsonl"))
  } catch {
    return []
  }
}

// Claude Code keeps sessions in projects/<cwd with every other character a dash>/<id>.jsonl,
// each line naming the cwd once the conversation starts.
const claudeSessions = async (search: SessionSearch, root: string): Promise<string[]> => {
  const directory = join(root, "projects", search.cwd.replace(/[^A-Za-z0-9]/g, "-"))
  const found = await Promise.all(
    (await list(directory)).map(async (name) => {
      const path = join(directory, name)
      if (!(await recent(path, search.since))) return undefined
      const lines = (await head(path).catch(() => [])).map(json)
      const cwd = lines.find((line) => line?.cwd !== undefined)?.cwd
      return same(cwd, search.cwd) ? basename(name, ".jsonl") : undefined
    }),
  )
  return found.filter((id) => id !== undefined)
}

const dateDirectory = (root: string, date: Date): string =>
  join(
    root,
    "sessions",
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  )

// Codex keeps sessions in sessions/YYYY/MM/DD/rollout-*.jsonl under local dates, the
// first line a session_meta whose payload names the id and cwd.
const codexSessions = async (search: SessionSearch, root: string): Promise<string[]> => {
  const days: Date[] = []
  const start = new Date(Math.max(search.since - slackMs, Date.now() - maxDays * 86_400_000))
  for (
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    day.getTime() <= Date.now();
    day.setDate(day.getDate() + 1)
  )
    days.push(new Date(day))
  const found = await Promise.all(
    days.map(async (day) => {
      const directory = dateDirectory(root, day)
      return Promise.all(
        (await list(directory)).map(async (name) => {
          const path = join(directory, name)
          if (!(await recent(path, search.since))) return undefined
          const [first] = await head(path).catch(() => [])
          const payload = json(first ?? "")?.payload as Record<string, unknown> | undefined
          return payload && same(payload.cwd, search.cwd) && typeof payload.id === "string"
            ? payload.id
            : undefined
        }),
      )
    }),
  )
  return found.flat().filter((id) => id !== undefined)
}

/**
 * The agent's session that ran in `cwd` since `since`, from the agent's own session
 * files, read and never written. Undefined when none does, or more than one, so a
 * guess never resumes someone else's session.
 */
export const findAgentSession = async (
  agent: AgentName,
  search: SessionSearch,
): Promise<string | undefined> => {
  const env = search.env ?? process.env
  const home = search.home ?? homedir()
  const found =
    agent === "claude"
      ? await claudeSessions(search, env.CLAUDE_CONFIG_DIR || join(home, ".claude"))
      : await codexSessions(search, env.CODEX_HOME || join(home, ".codex"))
  const candidates = [...new Set(found)].filter((id) => !search.exclude.has(id))
  return candidates.length === 1 ? candidates[0] : undefined
}
