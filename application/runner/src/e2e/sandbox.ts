import { execFileSync } from "node:child_process"
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
   * model as HTTP(S)_PROXY with loopback exempt (Node's fetch included), and npm's
   * prefix inside the sandbox so a harness that updates itself can't touch a global
   * install.
   */
  readonly env: Readonly<Record<string, string>>
  /**
   * When the sandbox was made, in clock ticks since boot, as `/proc/<pid>/stat` gives a
   * process's start: every process of the sandbox started at or after it.
   */
  readonly started: number
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
  const started = sinceBoot()
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
  return { root, home, project, env, started }
}

// The clock ticks a second that /proc counts processes' start in.
let ticks: number | undefined
const hertz = (): number => {
  try {
    ticks ??= Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim()) || 100
  } catch {
    ticks = 100
  }
  return ticks
}

// Clock ticks since boot now, from /proc/uptime; 0 where there is none.
const sinceBoot = (): number => {
  try {
    const seconds = Number(readFileSync("/proc/uptime", "utf8").split(" ")[0])
    return Math.floor(seconds * hertz())
  } catch {
    return 0
  }
}

// What the tripwire watches in the developer's home. Configuration files the developer's
// own sessions rewrite as they start or run are read, and only searched for the
// sandbox's root, which only a connect or trust that leaked out of the sandbox would
// write there. Nothing read is kept or printed.
const searched = [
  ".claude/settings.json",
  ".claude/plugins/installed_plugins.json",
  ".claude/plugins/known_marketplaces.json",
  ".codex/config.toml",
  ".gemini/antigravity-cli/settings.json",
]

// Folders whose entries' names are searched for the sandbox's name, as Antigravity
// rewrites its MCP servers' folder each time it starts.
const listed = [".gemini/antigravity-cli/mcp"]

// Paths whose modification time and size alone are compared, never their contents: a
// login, which is never read, and plugin folders that change only when a plugin is
// installed or removed, not as a session starts.
const stamped = [
  ".codex/auth.json",
  ".codex/plugins/cache",
  ".codex/plugins/cache/novadeck",
  ".gemini/config/plugins",
  ".gemini/antigravity-cli/plugin_data",
  ".gemini/antigravity-cli/bin",
]

// A path's modification time and size, or nothing when it's absent.
const stamp = (path: string): string | undefined => {
  try {
    const stats = statSync(path)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return undefined
  }
}

const stamps = (user: string): ReadonlyMap<string, string | undefined> =>
  new Map(stamped.map((path) => [join(user, path), stamp(join(user, path))]))

// Whether the file holds the text; an absent or unreadable file holds nothing.
const holds = (path: string, text: string): boolean => {
  try {
    return readFileSync(path, "utf8").includes(text)
  } catch {
    return false
  }
}

// Whether a folder has an entry whose name holds the text.
const names = (path: string, text: string): boolean => {
  try {
    return readdirSync(path).some((name) => name.includes(text))
  } catch {
    return false
  }
}

/**
 * A tripwire over the developer's real harness homes: call it before a test, and call
 * what it returns after, for the paths a harness that escaped the sandbox wrote to. Those
 * are the configuration files that now mention the sandbox's root, the folders with an
 * entry named after the sandbox, a Claude Code project named after it, and the stamped
 * paths whose time or size changed, or that appeared or went. Only paths are returned,
 * never anything read. A path absent both times, as all are in CI, is skipped.
 */
export const tripwire = (sandbox: Pick<Sandbox, "root">): (() => readonly string[]) => {
  const user = userInfo().homedir
  const before = stamps(user)
  const own = basename(sandbox.root)
  // Claude Code names a project's folder after its path, every other character a dash.
  const named = own.replace(/[^a-zA-Z0-9]/g, "-")
  return () => {
    const changed = [...stamps(user)]
      .filter(([path, after]) => before.get(path) !== after)
      .map(([path]) => path)
    const mentioned = searched
      .map((path) => join(user, path))
      .filter((path) => holds(path, sandbox.root))
    const entries = listed.map((path) => join(user, path)).filter((path) => names(path, own))
    const projects = names(join(user, ".claude", "projects"), named)
      ? [join(user, ".claude", "projects")]
      : []
    return [...changed, ...mentioned, ...entries, ...projects]
  }
}

/**
 * A process as /proc shows it: its command's name, and its start in clock ticks since
 * boot, which with its pid tells it apart from a later process given the same pid.
 */
type Process = { readonly pid: number; readonly comm: string; readonly start: number }

/**
 * The process with the pid, should it belong to the sandbox. It reads the process's
 * `stat` for its state and start, and passes over a zombie and any process that started
 * before the sandbox. Only for the rest does it read the target of `cwd`, then, should
 * that not be inside the sandbox, `environ`, searched only for `HOME=<sandbox home>`
 * and neither kept nor printed, and last its `comm`.
 */
const member = (
  sandbox: Pick<Sandbox, "root" | "home" | "started">,
  pid: number,
): Process | undefined => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    // Fields after the command, which is in parentheses and may hold anything: the state
    // is field 3, the start field 22.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
    const start = Number(fields[19])
    if (fields[0] === "Z" || !(start >= sandbox.started)) return undefined
    const cwd = readlinkSync(`/proc/${pid}/cwd`)
    const inside = cwd === sandbox.root || cwd.startsWith(`${sandbox.root}/`)
    if (
      !inside &&
      !readFileSync(`/proc/${pid}/environ`, "latin1").split("\0").includes(`HOME=${sandbox.home}`)
    )
      return undefined
    return { pid, start, comm: readFileSync(`/proc/${pid}/comm`, "utf8").trim() }
  } catch {
    // Gone, or another user's, which a sandbox's process never is.
    return undefined
  }
}

const processes = (sandbox: Pick<Sandbox, "root" | "home" | "started">): Process[] =>
  readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name) && Number(name) !== process.pid)
    .flatMap((name) => member(sandbox, Number(name)) ?? [])

// Whether the process is still the same one, still the sandbox's, and not a zombie.
const still = (sandbox: Pick<Sandbox, "root" | "home" | "started">, one: Process): boolean =>
  member(sandbox, one.pid)?.start === one.start

// Signals the process, should it still be the one found.
const signal = (
  sandbox: Pick<Sandbox, "root" | "home" | "started">,
  one: Process,
  name: NodeJS.Signals,
) => {
  if (!still(sandbox, one)) return
  try {
    process.kill(one.pid, name)
  } catch {
    // Gone meanwhile.
  }
}

// Waits until none of them is still running or the time is up.
const ended = async (
  sandbox: Pick<Sandbox, "root" | "home" | "started">,
  found: readonly Process[],
  ms: number,
): Promise<void> => {
  const deadline = Date.now() + ms
  while (found.some((one) => still(sandbox, one)) && Date.now() < deadline)
    // eslint-disable-next-line no-await-in-loop -- Waits for them to end.
    await new Promise((resolve) => setTimeout(resolve, 50))
}

/**
 * Ends the processes still running in the sandbox once its deck has closed: those that
 * started after it was made and whose working folder is inside it, or whose HOME is its
 * home. A harness the deck's hangup reached may take a moment to exit, so each gets
 * three seconds to end by itself; one still running then gets SIGTERM, then SIGKILL if it
 * outlives two seconds more. As ending one may leave a child behind, it looks again,
 * up to five times, until it finds none it hasn't seen. Returns those that had to be
 * ended, by their commands' names, as a leak the test reports. Linux only, as it reads
 * /proc.
 */
export const reap = async (
  sandbox: Pick<Sandbox, "root" | "home" | "started">,
): Promise<string[]> => {
  const seen = new Set<string>()
  const leftovers: string[] = []
  for (let round = 0; round < 5; round += 1) {
    const found = processes(sandbox).filter((one) => !seen.has(`${one.pid}:${one.start}`))
    if (found.length === 0) break
    for (const one of found) seen.add(`${one.pid}:${one.start}`)
    // eslint-disable-next-line no-await-in-loop -- Each round waits on the one found.
    await ended(sandbox, found, 3000)
    const leftover = found.filter((one) => still(sandbox, one))
    for (const one of leftover) signal(sandbox, one, "SIGTERM")
    // eslint-disable-next-line no-await-in-loop -- As above.
    await ended(sandbox, leftover, 2000)
    for (const one of leftover) signal(sandbox, one, "SIGKILL")
    leftovers.push(...leftover.map((one) => `${one.comm} (${one.pid})`))
  }
  return leftovers
}
