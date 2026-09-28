import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"

import { describe, expect, it as base } from "../test.js"
import { createAgents } from "./agents.js"
import { installShellFiles } from "./install.js"
import type { ShellPaths } from "./scripts.js"

const windows = process.platform === "win32"

// Stands in for an agent's `plugin` commands: it records each call and changes the
// agent's own configuration the way the real command does.
const fakeAgent = `
const fs = require("node:fs")
const path = require("node:path")
const [agent, ...args] = process.argv.slice(2)
const home = process.env.HOME
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify([agent, ...args]) + "\\n")
if (process.env.FAKE_FAIL && args.join(" ").includes(process.env.FAKE_FAIL)) {
  console.error("something went wrong")
  process.exit(1)
}
const command = args.slice(1).filter((arg) => !arg.startsWith("/") && !/^[A-Za-z]:/.test(arg)).join(" ")
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
if (agent === "claude") {
  const file = path.join(home, ".claude", "settings.json")
  if (command === "install novadeck@novadeck") write(file, JSON.stringify({ enabledPlugins: { "novadeck@novadeck": true } }))
  if (command === "uninstall novadeck@novadeck") write(file, JSON.stringify({ enabledPlugins: {} }))
}
if (agent === "codex") {
  const file = path.join(home, ".codex", "config.toml")
  if (command === "add novadeck@novadeck") write(file, '[plugins."novadeck@novadeck"]\\nenabled = true\\n')
  if (command === "remove novadeck@novadeck") write(file, "")
}
if (agent === "agy") {
  const file = path.join(home, ".gemini", "config", "plugins", "novadeck", "plugin.json")
  if (command === "install") write(file, "{}")
  if (command === "uninstall novadeck") fs.rmSync(file, { force: true })
}
`

type Fixture = {
  home: string
  paths: ShellPaths
  agents: (env?: NodeJS.ProcessEnv) => ReturnType<typeof createAgents>
  calls: () => string[][]
}

const it = base.extend<{ fixture: Fixture }>({
  fixture: async ({ resources }, use) => {
    const root = mkdtempSync(join(tmpdir(), "novadeck-agents-"))
    resources.defer(() => rmSync(root, { recursive: true, force: true }))
    const home = join(root, "home")
    const bin = join(root, "bin")
    mkdirSync(home)
    mkdirSync(bin)
    const script = join(root, "agent.cjs")
    writeFileSync(script, fakeAgent)
    for (const agent of ["claude", "codex", "agy"])
      if (windows)
        writeFileSync(
          join(bin, `${agent}.cmd`),
          `@"${process.execPath}" "${script}" ${agent} %*\r\n`,
        )
      else
        writeFileSync(
          join(bin, agent),
          `#!/bin/sh\nexec "${process.execPath}" "${script}" ${agent} "$@"\n`,
          { mode: 0o755 },
        )
    const log = join(root, "calls.log")
    const paths = await installShellFiles(join(root, "shell"))
    const agents = (env: NodeJS.ProcessEnv = {}) =>
      createAgents(() => Promise.resolve(paths), {
        home,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          SHELL: "/bin/sh",
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          CLAUDE_CONFIG_DIR: "",
          CODEX_HOME: "",
          FAKE_LOG: log,
          ...env,
        },
      })
    const calls = () => {
      try {
        return readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as string[])
      } catch {
        return []
      }
    }
    await use({ home, paths, agents, calls })
  },
})

const installed = (home: string, ...agents: string[]) => {
  const homes = { claude: [".claude"], codex: [".codex"], agy: [".gemini", "antigravity-cli"] }
  for (const agent of agents)
    mkdirSync(join(home, ...homes[agent as keyof typeof homes]), { recursive: true })
}

describe("agents NovaDeck can connect", () => {
  it("are available only where their own home exists", async ({ fixture }) => {
    installed(fixture.home, "codex")
    expect(await fixture.agents().list()).toEqual([
      { agent: "claude", available: false, connected: false },
      { agent: "codex", available: true, connected: false },
      { agent: "agy", available: false, connected: false },
    ])
  })

  it("connect Claude Code through its own plugin commands, from NovaDeck's marketplace", async ({
    fixture,
  }) => {
    installed(fixture.home, "claude")
    const agents = fixture.agents()
    expect(await agents.set("claude", true)).toEqual({
      agent: "claude",
      available: true,
      connected: true,
    })
    expect(fixture.calls()).toEqual([
      ["claude", "plugin", "marketplace", "remove", "novadeck"],
      ["claude", "plugin", "marketplace", "add", fixture.paths.plugins.claude],
      ["claude", "plugin", "install", "novadeck@novadeck"],
    ])
    expect(await agents.set("claude", false)).toMatchObject({ connected: false })
    expect(fixture.calls().slice(3)).toEqual([
      ["claude", "plugin", "uninstall", "novadeck@novadeck"],
      ["claude", "plugin", "marketplace", "remove", "novadeck"],
    ])
  })

  it("connect Codex and Antigravity the same way", async ({ fixture }) => {
    installed(fixture.home, "codex", "agy")
    const agents = fixture.agents()
    await agents.set("codex", true)
    await agents.set("agy", true)
    expect(await agents.list()).toEqual([
      { agent: "claude", available: false, connected: false },
      { agent: "codex", available: true, connected: true },
      { agent: "agy", available: true, connected: true },
    ])
    expect(fixture.calls()).toContainEqual(["codex", "plugin", "add", "novadeck@novadeck"])
    expect(fixture.calls()).toContainEqual(["agy", "plugin", "install", fixture.paths.plugins.agy])
    await agents.set("agy", false)
    expect((await agents.list())[2]).toMatchObject({ connected: false })
  })

  it("say why an agent could not be connected", async ({ fixture }) => {
    installed(fixture.home, "claude")
    await expect(
      fixture.agents({ FAKE_FAIL: "install" }).set("claude", true),
    ).rejects.toMatchObject({
      code: "AGENT_SETUP_FAILED",
      message: expect.stringContaining("something went wrong"),
    })
    await expect(fixture.agents().set("codex", true)).rejects.toMatchObject({
      code: "AGENT_SETUP_FAILED",
    })
  })
})
