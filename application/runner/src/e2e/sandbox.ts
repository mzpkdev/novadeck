import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, delimiter, dirname, join } from "node:path"

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
   * install. On Windows also the user's folders, which programs there find their home
   * and configuration by (USERPROFILE, APPDATA, LOCALAPPDATA, TEMP), all inside the
   * sandbox, and the system's own variables, which its programs need to start.
   */
  readonly env: Readonly<Record<string, string>>
  /**
   * When the sandbox was made: every process of the sandbox started at or after it. On
   * Linux in clock ticks since boot, as `/proc/<pid>/stat` gives a process's start; on
   * Windows in milliseconds since the epoch, as a process's creation time converts to.
   */
  readonly started: number
}

const windows = process.platform === "win32"

// The first folder on the tests' own PATH holding the program, for the system tools a
// sandbox on Windows needs (git, PowerShell 7), never a harness.
const onPath = (program: string): string | undefined =>
  (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .find((folder) => existsSync(join(folder, program)))

/**
 * Git for Windows' bash, which Claude Code on Windows runs its Bash tool in and won't
 * start without: `<Git>\bin\bash.exe`, found above the git on the tests' PATH, whether
 * that is `<Git>\cmd\git.exe`, as an install puts on PATH, `<Git>\bin\git.exe`, or
 * `<Git>\mingw64\bin\git.exe`, first on PATH under Git's own bash, as CI's steps run.
 */
export const gitBash = (): string | undefined => {
  const folder = onPath("git.exe")
  if (!folder) return undefined
  const above = [folder, dirname(folder), dirname(dirname(folder))]
  return above.map((root) => join(root, "bin", "bash.exe")).find((path) => existsSync(path))
}

// Windows' own variables, which its programs need to start and to find the system: the
// machine's, never the developer's.
const systemVariables = [
  "SystemRoot",
  "SystemDrive",
  "windir",
  "ComSpec",
  "PATHEXT",
  "OS",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "CommonProgramFiles",
  "CommonProgramFiles(x86)",
  "CommonProgramW6432",
  "ALLUSERSPROFILE",
  "PUBLIC",
]

/**
 * What a sandbox on Windows adds: the system's variables; the user's folders, as Node,
 * Go and Rust find a home by USERPROFILE and configuration by APPDATA and LOCALAPPDATA
 * there, never HOME; PowerShell's own modules only; and the system's folders on PATH,
 * with git (Codex's project and Claude Code's bash) and PowerShell 7 when installed.
 */
const windowsEnvironment = (
  home: string,
  folder: (...parts: string[]) => string,
): { readonly env: Record<string, string>; readonly path: readonly string[] } => {
  const system = Object.fromEntries(
    systemVariables.flatMap((name) => {
      const value = process.env[name]
      return value ? [[name, value]] : []
    }),
  )
  const root = system.SystemRoot ?? "C:\\Windows"
  const powershell = join(root, "System32", "WindowsPowerShell", "v1.0")
  const temp = folder("tmp")
  return {
    env: {
      ...system,
      USERPROFILE: home,
      HOMEDRIVE: home.slice(0, 2),
      HOMEPATH: home.slice(2),
      USERNAME: "novadeck",
      APPDATA: folder("home", "AppData", "Roaming"),
      LOCALAPPDATA: folder("home", "AppData", "Local"),
      TEMP: temp,
      TMP: temp,
      PSModulePath: join(powershell, "Modules"),
    },
    path: [
      join(root, "System32"),
      root,
      join(root, "System32", "Wbem"),
      powershell,
      ...[onPath("git.exe"), onPath("pwsh.exe")].filter((one) => one !== undefined),
    ],
  }
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
  const started = windows ? Date.now() : sinceBoot()
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
  const system = windows ? windowsEnvironment(home, folder) : undefined
  const proxy = options.proxy
  const loopback = "127.0.0.1,localhost"
  const env: Record<string, string> = {
    ...system?.env,
    HOME: home,
    USER: "novadeck",
    LOGNAME: "novadeck",
    SHELL: windows ? (system?.env.ComSpec ?? "cmd.exe") : "/bin/bash",
    TERM: "xterm-256color",
    LANG: "C.UTF-8",
    PATH: [...options.bins, node, ...(system?.path ?? ["/usr/bin", "/bin"])].join(delimiter),
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
