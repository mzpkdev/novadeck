import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  symlinkSync,
} from "node:fs"
import { tmpdir, userInfo } from "node:os"
import { basename, delimiter, join } from "node:path"

/**
 * Where an end-to-end test runs its harnesses: a throwaway home and project, and an
 * environment made only of what the sandbox sets, never the developer's. Nothing in it
 * can reach the developer's real configuration, login or keyring.
 */
export type Sandbox = {
  readonly root: string
  /** The throwaway HOME, which also holds the XDG folders. */
  readonly home: string
  /** The project folder the agents run in. */
  readonly project: string
  /**
   * The environment every sandboxed process gets: HOME, XDG folders, a PATH of the pinned
   * harnesses and system tools, a dead D-Bus address so no keyring is reachable, the fake
   * model as HTTP(S)_PROXY with loopback exempt (Node's fetch included), and npm's prefix inside the sandbox so a
   * harness that updates itself can't touch a global install.
   */
  readonly env: Readonly<Record<string, string>>
}

export type SandboxOptions = {
  /** The fake model's proxy address. */
  readonly proxy: string
  /** The folders holding the pinned harnesses' programs, first on PATH. */
  readonly bins: readonly string[]
}

/**
 * Makes a sandbox under the system's temporary folder; the caller removes `root`. Node
 * reaches PATH through a folder of its own, as the one it is installed in may hold global
 * installs of the very harnesses under test.
 */
export const createSandbox = (options: SandboxOptions): Sandbox => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-e2e-")))
  const folder = (...parts: string[]) => {
    const path = join(root, ...parts)
    mkdirSync(path, { recursive: true, mode: 0o700 })
    return path
  }
  const home = folder("home")
  const project = folder("project")
  const runtime = folder("run")
  const node = folder("node")
  symlinkSync(process.execPath, join(node, basename(process.execPath)))
  const proxy = options.proxy
  const loopback = "127.0.0.1,localhost"
  const env: Record<string, string> = {
    HOME: home,
    USER: "novadeck",
    LOGNAME: "novadeck",
    SHELL: "/bin/bash",
    TERM: "xterm-256color",
    LANG: "C.UTF-8",
    PATH: [...options.bins, node, "/usr/bin", "/bin"].join(delimiter),
    TMPDIR: folder("tmp"),
    XDG_CONFIG_HOME: folder("home", ".config"),
    XDG_DATA_HOME: folder("home", ".local", "share"),
    XDG_STATE_HOME: folder("home", ".local", "state"),
    XDG_CACHE_HOME: folder("home", ".cache"),
    XDG_RUNTIME_DIR: runtime,
    // A bus that isn't there, so no keyring or secret service answers.
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${join(runtime, "no-bus")}`,
    NPM_CONFIG_PREFIX: folder("npm"),
    // Upper and lower case, as programs read one or the other.
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy,
    NO_PROXY: loopback,
    no_proxy: loopback,
    // Node's own fetch takes the proxy only when told to.
    NODE_USE_ENV_PROXY: "1",
  }
  return { root, home, project, env }
}

// What the tripwire watches in the developer's home: the files and folders a harness
// writes when it is configured, connected to a plugin or signed in. Busy files the
// developer's own running agents change all the time, such as histories, sessions,
// sockets and state, aren't on the list, so a real session beside the tests can't trip it.
const watched = [
  // Claude Code: its settings, and the plugins and marketplaces it has installed.
  ".claude/settings.json",
  ".claude/plugins/installed_plugins.json",
  ".claude/plugins/known_marketplaces.json",
  // Codex: its configuration, which also lists its plugins and marketplaces, its login,
  // and the folder its installed plugins are copied into, NovaDeck's among them.
  ".codex/config.toml",
  ".codex/auth.json",
  ".codex/plugins/cache",
  ".codex/plugins/cache/novadeck",
  // Antigravity: the plugins NovaDeck installs into, its settings, and the folders its
  // MCP servers, plugins' data and programs live in.
  ".gemini/config/plugins",
  ".gemini/antigravity-cli/settings.json",
  ".gemini/antigravity-cli/mcp",
  ".gemini/antigravity-cli/plugin_data",
  ".gemini/antigravity-cli/bin",
]

// A path's modification time and size, never its contents, or nothing when it's absent.
const stamp = (path: string): string | undefined => {
  try {
    const stats = statSync(path)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return undefined
  }
}

const stamps = (user: string): ReadonlyMap<string, string | undefined> =>
  new Map(watched.map((path) => [join(user, path), stamp(join(user, path))]))

/**
 * A tripwire over the developer's real harness homes: call it before a test, and call
 * what it returns after, for the watched paths that changed, appeared or went. Besides
 * them it looks for a Claude Code project named after the sandbox, which only a harness
 * that ran in the sandbox with the real home would have made. A path absent both times,
 * as all are in CI, is skipped.
 */
export const tripwire = (sandbox: Pick<Sandbox, "root">): (() => readonly string[]) => {
  const user = userInfo().homedir
  const before = stamps(user)
  // Claude Code names a project's folder after its path, every other character a dash.
  const named = basename(sandbox.root).replace(/[^a-zA-Z0-9]/g, "-")
  return () => {
    const changed = [...stamps(user)]
      .filter(([path, after]) => before.get(path) !== after)
      .map(([path]) => path)
    let projects: string[] = []
    try {
      projects = readdirSync(join(user, ".claude", "projects"))
        .filter((name) => name.includes(named))
        .map((name) => join(user, ".claude", "projects", name))
    } catch {
      // No projects there.
    }
    return [...changed, ...projects]
  }
}

// What a process is, from /proc: its command's name, its working folder and its HOME.
// Only the HOME entry of its environment is looked at, and nothing of it is kept.
type Process = { readonly pid: number; readonly comm: string }

const processes = (sandbox: Pick<Sandbox, "root" | "home">): Process[] => {
  const home = `HOME=${sandbox.home}`
  const inside = (path: string) => path === sandbox.root || path.startsWith(`${sandbox.root}/`)
  return readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name) && Number(name) !== process.pid)
    .flatMap((name) => {
      try {
        const cwd = readlinkSync(`/proc/${name}/cwd`)
        const homed =
          !inside(cwd) && readFileSync(`/proc/${name}/environ`, "latin1").split("\0").includes(home)
        if (!inside(cwd) && !homed) return []
        return [{ pid: Number(name), comm: readFileSync(`/proc/${name}/comm`, "utf8").trim() }]
      } catch {
        // Gone, or another user's, which a sandbox's process never is.
        return []
      }
    })
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const signal = (pid: number, name: NodeJS.Signals) => {
  try {
    process.kill(pid, name)
  } catch {
    // Already gone.
  }
}

// Waits until none of them is alive or the time is up.
const ended = async (found: readonly Process[], ms: number): Promise<void> => {
  const deadline = Date.now() + ms
  while (found.some((one) => alive(one.pid)) && Date.now() < deadline)
    // eslint-disable-next-line no-await-in-loop -- Waits for them to end.
    await new Promise((resolve) => setTimeout(resolve, 50))
}

/**
 * Ends the processes still running in the sandbox once its deck has closed: those whose
 * working folder is inside it, or whose HOME is its home. A harness the deck's hangup
 * reached may take a moment to exit, so each gets three seconds to end by itself; one
 * still running then gets SIGTERM, then SIGKILL if it outlives two seconds more. Returns
 * those that had to be ended, by their commands' names, as a leak the test reports.
 * Linux only, as it reads /proc.
 */
export const reap = async (sandbox: Pick<Sandbox, "root" | "home">): Promise<string[]> => {
  const found = processes(sandbox)
  await ended(found, 3000)
  const leftover = found.filter((one) => alive(one.pid))
  for (const one of leftover) signal(one.pid, "SIGTERM")
  await ended(leftover, 2000)
  for (const one of leftover) if (alive(one.pid)) signal(one.pid, "SIGKILL")
  return leftover.map((one) => `${one.comm} (${one.pid})`)
}
