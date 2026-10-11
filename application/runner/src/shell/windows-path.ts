import { execFile } from "node:child_process"
import { join } from "node:path"

/** The name `env` keeps PATH under: Windows' own spelling is "Path". */
export const pathKey = (env: NodeJS.ProcessEnv): string =>
  Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH"

// "C:\Tools\", "c:\tools" and `"C:\Tools"` are one folder to Windows; a drive's root keeps
// its backslash, as "C:" alone is the drive's current folder, another one.
const folderKey = (folder: string): string => {
  const bare = folder.trim().replace(/^"(.*)"$/, "$1")
  return (
    /^[a-z]:[\\/]+$/i.test(bare) ? `${bare.slice(0, 2)}\\` : bare.replace(/[\\/]+$/, "")
  ).toLowerCase()
}

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

type Variables = { readonly [name: string]: unknown }

// A key's PATH value, whatever case its name is in.
const pathOf = (variables: Variables): unknown =>
  Object.entries(variables).find(([name]) => name.toUpperCase() === "PATH")?.[1]

/**
 * `value` with each `%NAME%` replaced as Windows does for a new process: by the registry's
 * variable of that name, any case, else the environment's, else left as written.
 */
const expand = (value: string, variables: Variables, env: NodeJS.ProcessEnv): string => {
  const named = new Map<string, string>()
  for (const [name, each] of Object.entries(env))
    if (each !== undefined) named.set(name.toUpperCase(), each)
  for (const [name, each] of Object.entries(variables))
    if (typeof each === "string") named.set(name.toUpperCase(), each)
  let text = value
  // A variable may itself name another, as nvm-windows' NVM_SYMLINK can.
  for (let pass = 0; pass < 4 && /%[^%;]+%/.test(text); pass += 1)
    text = text.replaceAll(
      /%([^%;]+)%/g,
      (whole, name: string) => named.get(name.toUpperCase()) ?? whole,
    )
  return text
}

/**
 * The machine's and then the user's PATH folders, from the lookup's base64 answer: each
 * key's values as the registry holds them, unexpanded. Each PATH is expanded against the
 * registry's own variables, the user's over the machine's for the user's PATH, as Windows
 * builds a new process's environment, before `env`'s stale ones: an install that added a
 * variable and a PATH entry naming it (nvm-windows' `%NVM_SYMLINK%`, a JDK's
 * `%JAVA_HOME%\bin`) is found. Undefined for an answer that isn't one.
 */
export const registryFolders = (
  answer: string,
  env: NodeJS.ProcessEnv = {},
): readonly string[] | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(answer.trim(), "base64").toString("utf8"))
  } catch {
    return undefined
  }
  const { machine, user } = (parsed ?? {}) as { machine?: unknown; user?: unknown }
  if (typeof machine !== "object" || machine === null) return undefined
  if (typeof user !== "object" || user === null) return undefined
  const machines = machine as Variables
  const users = user as Variables
  const machinePath = pathOf(machines)
  const userPath = pathOf(users)
  return [
    ...(typeof machinePath === "string" ? expand(machinePath, machines, env).split(";") : []),
    ...(typeof userPath === "string"
      ? expand(userPath, { ...machines, ...users }, env).split(";")
      : []),
  ]
}

// Each key's values unexpanded, as JSON; base64 keeps any folder's name, which a console
// code page would not, as reg.exe's output loses "Ł".
const lookup = [
  "$read = { param($key) $values = @{}; if ($key) { foreach ($name in $key.GetValueNames()) { $values[$name] = $key.GetValue($name, '', 'DoNotExpandEnvironmentNames') } }; $values }",
  "$machine = & $read ([Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'))",
  "$user = & $read ([Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment'))",
  "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json @{ machine = $machine; user = $user } -Compress -Depth 3)))",
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
      (error, stdout) => resolve(error ? undefined : registryFolders(stdout, env)),
    )
  })

// The registry's folders last read, for every caller, and the read under way, if any:
// one PowerShell at a time, not one per terminal, as a workspace restored with many.
let last: { readonly at: number; readonly folders: readonly string[] } | undefined
let reading: Promise<readonly string[] | undefined> | undefined

const folders = (
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  maxAgeMs: number,
  read: typeof readRegistry,
): Promise<readonly string[] | undefined> => {
  const now = Date.now()
  if (!reading && (!last || now - last.at > maxAgeMs))
    reading = read(env, timeoutMs).then((found) => {
      if (found) last = { at: now, folders: found }
      reading = undefined
      return found
    })
  // The last answer serves at once, however old, while a newer one is read behind it.
  return last ? Promise.resolve(last.folders) : reading!
}

/**
 * `env` with PATH as a new Windows terminal would have it. A Windows program keeps the
 * environment it started with, and passes it on: an app opened from a browser that has
 * run since before an install never sees that install's folder on PATH. The registry
 * has it, as Explorer and new consoles do. Read once, then again in the background once
 * the last read is `maxAgeMs` old, each caller served the last answer meanwhile, so only
 * the first waits. Elsewhere, and when the registry can't be read, `env` stays as it is.
 */
export const refreshPath = async (
  env: NodeJS.ProcessEnv,
  {
    platform = process.platform,
    timeoutMs = 5_000,
    maxAgeMs = 30_000,
    read = readRegistry,
  }: {
    readonly platform?: NodeJS.Platform
    readonly timeoutMs?: number
    readonly maxAgeMs?: number
    readonly read?: typeof readRegistry
  } = {},
): Promise<NodeJS.ProcessEnv> => {
  if (platform !== "win32") return env
  const found = await folders(env, timeoutMs, maxAgeMs, read)
  if (!found) return env
  const key = pathKey(env)
  return { ...env, [key]: mergePath(env[key] ?? "", found) }
}

/** Forgets what was read, as a test that reads afresh needs. */
export const forgetPath = (): void => {
  last = undefined
  reading = undefined
}
