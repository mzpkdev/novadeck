import { execFile } from "node:child_process"
import { join } from "node:path"

/** The name `env` keeps PATH under: Windows' own spelling is "Path". */
export const pathKey = (env: NodeJS.ProcessEnv): string =>
  Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH"

// "C:\Tools\" and "c:\tools" are one folder to Windows.
const folderKey = (folder: string): string => folder.replace(/[\\/]+$/, "").toLowerCase()

/**
 * `current` as it is, then the registry's folders it lacks, in the registry's order, each
 * folder once: what the app was started with keeps its order, and only gains.
 */
export const mergePath = (current: string, registry: readonly string[]): string => {
  const seen = new Set<string>()
  return [...current.split(";"), ...registry]
    .filter((folder) => {
      const key = folderKey(folder)
      if (key === "" || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(";")
}

/** The machine's and then the user's PATH folders, from the lookup's base64 answer. */
export const registryFolders = (answer: string): readonly string[] | undefined => {
  const text = Buffer.from(answer.trim(), "base64").toString("utf8")
  const [machine, user] = text.split("\0")
  if (machine === undefined || user === undefined) return undefined
  return [...machine.split(";"), ...user.split(";")]
}

// .NET expands each REG_EXPAND_SZ value; base64 keeps any folder's name, which a console
// code page would not, as reg.exe's output loses "Ł".
const lookup = [
  "$machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')",
  "$user = [Environment]::GetEnvironmentVariable('Path', 'User')",
  '[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$machine`0$user"))',
].join("; ")

/** PATH's folders as the registry has them now, or undefined when it can't be read. */
const readRegistry = (env: NodeJS.ProcessEnv, timeoutMs: number) =>
  new Promise<readonly string[] | undefined>((resolve) => {
    const root = env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows"
    const powershell = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    execFile(
      powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", lookup],
      { env, timeout: timeoutMs, windowsHide: true },
      (error, stdout) => resolve(error ? undefined : registryFolders(stdout)),
    )
  })

/**
 * `env` with PATH as a new Windows terminal would have it. A Windows program keeps the
 * environment it started with, and passes it on: an app opened from a browser that has
 * run since before an install never sees that install's folder on PATH. The registry
 * has it, as Explorer and new consoles do. Elsewhere, and when the registry can't be
 * read, `env` stays as it is.
 */
export const refreshPath = async (
  env: NodeJS.ProcessEnv,
  { platform = process.platform, timeoutMs = 5_000 } = {},
): Promise<NodeJS.ProcessEnv> => {
  if (platform !== "win32") return env
  const folders = await readRegistry(env, timeoutMs)
  if (!folders) return env
  const key = pathKey(env)
  return { ...env, [key]: mergePath(env[key] ?? "", folders) }
}
