import { mkdirSync, mkdtempSync, readdirSync, realpathSync, statSync, symlinkSync } from "node:fs"
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
   * model as HTTP(S)_PROXY with loopback exempt, and npm's prefix inside the sandbox so a
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
  }
  return { root, home, project, env }
}

// The developer's own harness homes. Only their entries' names, times and sizes are
// read, never their contents.
const homes = [".claude", ".claude.json", ".codex", ".gemini"]

// Entries the developer's own running agents change all the time, which would trip the
// wire whenever a real session runs beside the tests: their histories, sessions,
// caches, logs and databases. Their settings, plugins' configuration and logins stay
// watched. `.claude.json` is one of them: Claude Code rewrites it as it runs.
const busy =
  /^(\.claude\.json|history\.jsonl|projects|sessions?|session-env|shell[-_]snapshots|file-history|todos|tasks|plans|backups|statsig|debug|ide|logs?|telemetry|cache|paste-cache|feedback|plugins|\.last-cleanup|thread-writer-locks|tui-.*|.*\.sqlite.*|logs_.*|models_cache\.json|version\.json|tmp|history|antigravity-cli|config|\.tmp)$/

type Entry = { readonly path: string; readonly stamp: string }

const stamp = (path: string): string | undefined => {
  try {
    const stats = statSync(path)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return undefined
  }
}

const entries = (user: string): Entry[] =>
  homes.flatMap((name) => {
    const path = join(user, name)
    if (stamp(path) === undefined) return []
    let names: string[]
    try {
      names = readdirSync(path)
    } catch {
      // A file, as ~/.claude.json is.
      return busy.test(name) ? [] : [{ path, stamp: stamp(path) ?? "" }]
    }
    return names
      .filter((one) => !busy.test(one))
      .map((one) => ({ path: join(path, one), stamp: stamp(join(path, one)) ?? "gone" }))
  })

/**
 * A tripwire over the developer's real harness homes: call it before a test, and call
 * what it returns after, for the entries that changed or appeared. Besides each watched
 * entry's time and size, it looks for a Claude Code project named after the sandbox,
 * which only a harness that ran in the sandbox with the real home would have made. On a
 * machine with none of those homes, as in CI, it finds nothing.
 */
export const tripwire = (sandbox: Pick<Sandbox, "root">): (() => readonly string[]) => {
  const user = userInfo().homedir
  const before = new Map(entries(user).map((entry) => [entry.path, entry.stamp]))
  // Claude Code names a project's folder after its path, every other character a dash.
  const named = basename(sandbox.root).replace(/[^a-zA-Z0-9]/g, "-")
  return () => {
    const changed = entries(user)
      .filter((entry) => before.get(entry.path) !== entry.stamp)
      .map((entry) => entry.path)
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
