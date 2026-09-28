import { spawn } from "node:child_process"
import { access, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import type { AgentName } from "@novadeck/protocol"

import { DomainError } from "../errors.js"
import type { ShellPaths } from "./scripts.js"

/** Whether an agent is installed here, and whether NovaDeck's plugin is installed into it. */
export type AgentIntegration = {
  readonly agent: AgentName
  readonly available: boolean
  readonly connected: boolean
}

export type AgentsOptions = {
  readonly env?: NodeJS.ProcessEnv
  readonly home?: string
  readonly platform?: NodeJS.Platform
  /** How long one of an agent's plugin commands may take, in milliseconds. */
  readonly timeoutMs?: number
}

const agents = ["claude", "codex", "agy"] as const satisfies readonly AgentName[]

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  )

const text = (path: string): Promise<string> => readFile(path, "utf8").catch(() => "")

type Agent = {
  /** The agent's own home, whose presence says it is installed. */
  readonly home: string
  /** Whether the agent's own configuration lists NovaDeck's plugin as installed. */
  readonly connected: () => Promise<boolean>
  /** Its plugin commands, run in order; a failing one marked `optional` is skipped. */
  readonly connect: readonly Command[]
  readonly disconnect: readonly Command[]
}
type Command = { readonly argv: readonly string[]; readonly optional?: boolean }

const plugin = "novadeck@novadeck"

/**
 * Each agent, as its own files and commands describe it. NovaDeck only reads the
 * agent's configuration; installing and removing its plugin goes through the agent's
 * own `plugin` commands, which own that configuration.
 */
const describe = (paths: ShellPaths, env: NodeJS.ProcessEnv, home: string) => {
  const claude = env.CLAUDE_CONFIG_DIR || join(home, ".claude")
  const codex = env.CODEX_HOME || join(home, ".codex")
  const gemini = join(home, ".gemini")
  return {
    claude: {
      home: claude,
      connected: async () => {
        try {
          const settings = JSON.parse(await text(join(claude, "settings.json"))) as {
            enabledPlugins?: Record<string, unknown>
          }
          return settings.enabledPlugins?.[plugin] === true
        } catch {
          return false
        }
      },
      connect: [
        // A marketplace left from an earlier connection is replaced, not added twice.
        { argv: ["claude", "plugin", "marketplace", "remove", "novadeck"], optional: true },
        { argv: ["claude", "plugin", "marketplace", "add", paths.plugins.claude] },
        { argv: ["claude", "plugin", "install", plugin] },
      ],
      disconnect: [
        { argv: ["claude", "plugin", "uninstall", plugin], optional: true },
        { argv: ["claude", "plugin", "marketplace", "remove", "novadeck"], optional: true },
      ],
    },
    codex: {
      home: codex,
      connected: async () =>
        /\[plugins\."novadeck@novadeck"\][^[]*?\benabled\s*=\s*true/.test(
          await text(join(codex, "config.toml")),
        ),
      connect: [
        { argv: ["codex", "plugin", "marketplace", "remove", "novadeck"], optional: true },
        { argv: ["codex", "plugin", "marketplace", "add", paths.plugins.codex] },
        { argv: ["codex", "plugin", "add", plugin] },
      ],
      disconnect: [
        { argv: ["codex", "plugin", "remove", plugin], optional: true },
        { argv: ["codex", "plugin", "marketplace", "remove", "novadeck"], optional: true },
      ],
    },
    // Antigravity keeps its own state beside other Google tools in ~/.gemini.
    agy: {
      home: join(gemini, "antigravity-cli"),
      connected: () => exists(join(gemini, "config", "plugins", "novadeck", "plugin.json")),
      connect: [
        { argv: ["agy", "plugin", "uninstall", "novadeck"], optional: true },
        { argv: ["agy", "plugin", "install", paths.plugins.agy] },
      ],
      disconnect: [{ argv: ["agy", "plugin", "uninstall", "novadeck"], optional: true }],
    },
  } satisfies Record<AgentName, Agent>
}

// Windows' cmd reads an argument in double quotes as it is; a path cannot hold one.
const cmdLine = (argv: readonly string[]): string =>
  argv.map((arg) => (/^[\w@.:\\/-]+$/.test(arg) ? arg : `"${arg}"`)).join(" ")

/**
 * Runs one of an agent's commands the way the person would in a terminal: through their
 * login shell, whose startup files put the agent on PATH even when the app was started
 * from a desktop menu, and through cmd on Windows, where agents install as .cmd files.
 */
const run = (
  argv: readonly string[],
  { env, platform, timeoutMs }: Required<Omit<AgentsOptions, "home">>,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child =
      platform === "win32"
        ? spawn(env.COMSPEC || "cmd.exe", ["/d", "/s", "/c", `"${cmdLine(argv)}"`], {
            env,
            stdio: ["ignore", "ignore", "pipe"],
            windowsVerbatimArguments: true,
            windowsHide: true,
          })
        : spawn(env.SHELL || "/bin/sh", ["-ilc", 'exec "$0" "$@"', ...argv], {
            env,
            stdio: ["ignore", "ignore", "pipe"],
          })
    let errors = ""
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      errors = (errors + chunk).slice(-2000)
    })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else
        reject(
          new Error(
            `${argv.slice(0, 3).join(" ")} failed: ${errors.trim().split("\n").at(-1) ?? code}`,
          ),
        )
    })
  })

/** The agents NovaDeck can connect, and connecting or disconnecting each one. */
export const createAgents = (
  paths: () => Promise<ShellPaths | undefined>,
  options: AgentsOptions = {},
) => {
  const env = options.env ?? process.env
  const home = options.home ?? env.HOME ?? homedir()
  const settings = {
    env,
    platform: options.platform ?? process.platform,
    timeoutMs: options.timeoutMs ?? 60_000,
  }
  const state = async (agent: AgentName, found: Agent): Promise<AgentIntegration> => ({
    agent,
    available: await exists(found.home),
    connected: await found.connected(),
  })
  const known = async () => {
    const shell = await paths()
    return shell && describe(shell, env, home)
  }
  // One change at a time: an agent's plugin commands edit its configuration.
  let queue = Promise.resolve()
  return {
    list: async (): Promise<AgentIntegration[]> => {
      const described = await known()
      if (!described) return agents.map((agent) => ({ agent, available: false, connected: false }))
      return Promise.all(agents.map((agent) => state(agent, described[agent])))
    },
    /** Installs or removes NovaDeck's plugin in the agent; resolves to where it stands after. */
    set: (agent: AgentName, connected: boolean): Promise<AgentIntegration> => {
      const change = queue.then(async () => {
        const described = await known()
        if (!described)
          throw new DomainError("AGENT_SETUP_FAILED", "Shell integration is unavailable.")
        const found = described[agent]
        if (!(await exists(found.home)))
          throw new DomainError("AGENT_SETUP_FAILED", `${agent} is not installed here.`)
        for (const command of connected ? found.connect : found.disconnect) {
          try {
            // eslint-disable-next-line no-await-in-loop -- Each step needs the one before.
            await run(command.argv, settings)
          } catch (error) {
            if (command.optional) continue
            throw new DomainError(
              "AGENT_SETUP_FAILED",
              error instanceof Error ? error.message : String(error),
            )
          }
        }
        const after = await state(agent, found)
        if (after.connected !== connected)
          throw new DomainError(
            "AGENT_SETUP_FAILED",
            `${agent} did not ${connected ? "install" : "remove"} NovaDeck's plugin.`,
          )
        return after
      })
      queue = change.then(
        () => {},
        () => {},
      )
      return change
    },
  }
}

export type Agents = ReturnType<typeof createAgents>
