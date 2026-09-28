import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { describe, expect, it as base } from "../test.js"
import { findAgentSession } from "./sessions.js"

const it = base.extend<{ home: string }>({
  home: async ({ resources }, use) => {
    const home = mkdtempSync(join(tmpdir(), "novadeck-sessions-"))
    resources.defer(() => rmSync(home, { recursive: true, force: true }))
    await use(home)
  },
})

const write = (path: string, lines: object[], modified = Date.now()) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n")
  utimesSync(path, modified / 1000, modified / 1000)
}

const cwd = process.platform === "win32" ? "C:\\work\\my.app" : "/work/my.app"
const other = process.platform === "win32" ? "C:\\work\\other" : "/work/other"
const claudeFile = (home: string, id: string, directory = cwd) =>
  join(home, ".claude", "projects", directory.replace(/[^A-Za-z0-9]/g, "-"), `${id}.jsonl`)
const claudeLines = (id: string, directory = cwd) => [
  { type: "summary", sessionId: id },
  { type: "user", cwd: directory, sessionId: id, timestamp: new Date().toISOString() },
]
const codexFile = (home: string, id: string, date = new Date()) =>
  join(
    home,
    ".codex",
    "sessions",
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    `rollout-${id}.jsonl`,
  )
const codexLines = (id: string, directory = cwd) => [
  { type: "session_meta", payload: { id, cwd: directory, timestamp: new Date().toISOString() } },
]

describe("finding a lost agent session in its own files", () => {
  it("finds the one Claude Code session in the directory since the last prompt", async ({
    home,
  }) => {
    const since = Date.now() - 60_000
    write(claudeFile(home, "old"), claudeLines("old"), since - 3_600_000)
    write(claudeFile(home, "new"), claudeLines("new"))
    const search = { cwd, since, exclude: new Set<string>(), home, env: {} }
    expect(await findAgentSession("claude", search)).toBe("new")
  })

  it("finds the one Codex session in the directory since the last prompt", async ({ home }) => {
    const since = Date.now() - 60_000
    write(codexFile(home, "a"), codexLines("a"))
    write(codexFile(home, "b"), codexLines("b", other))
    const search = { cwd, since, exclude: new Set<string>(), home, env: {} }
    expect(await findAgentSession("codex", search)).toBe("a")
  })

  it("does not guess between two sessions, but leaves out other terminals' own", async ({
    home,
  }) => {
    const since = Date.now() - 60_000
    write(claudeFile(home, "mine"), claudeLines("mine"))
    write(claudeFile(home, "theirs"), claudeLines("theirs"))
    const search = { cwd, since, exclude: new Set<string>(), home, env: {} }
    expect(await findAgentSession("claude", search)).toBeUndefined()
    expect(await findAgentSession("claude", { ...search, exclude: new Set(["theirs"]) })).toBe(
      "mine",
    )
  })

  it("finds nothing without a session, and honours the agents' own home settings", async ({
    home,
  }) => {
    const since = Date.now() - 60_000
    const search = { cwd, since, exclude: new Set<string>(), home, env: {} }
    expect(await findAgentSession("claude", search)).toBeUndefined()
    expect(await findAgentSession("codex", search)).toBeUndefined()
    const moved = join(home, "elsewhere")
    write(
      join(
        moved,
        "sessions",
        ...codexFile(home, "c")
          .split(/[\\/]sessions[\\/]/)[1]!
          .split(/[\\/]/),
      ),
      codexLines("c"),
    )
    expect(await findAgentSession("codex", { ...search, env: { CODEX_HOME: moved } })).toBe("c")
  })
})
