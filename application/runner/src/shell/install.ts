import { execFile } from "node:child_process"
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"

import { relayPath } from "@novadeck/relay"

import { shellFiles, shellPaths, staleShellFiles, type ShellPaths } from "./scripts.js"

/**
 * The shell files as written, with the launcher as NovaDeck's shells name it in
 * NOVADECK_HOOK: on Windows its short name, which holds no spaces or brackets, so cmd
 * runs it unquoted.
 */
export type InstalledShell = ShellPaths & { readonly launcher: string }

export type InstallOptions = {
  /** The relay to copy in for the launchers; the one `@novadeck/relay` built by default. */
  readonly relay?: string
}

/**
 * Writes the shell integration, hook, relay and agent plugins into NovaDeck's own
 * directory, each only when it changed, replacing it whole so a shell starting at that
 * moment reads the old or the new file.
 */
export const installShellFiles = async (
  directory: string,
  { relay = relayPath }: InstallOptions = {},
): Promise<InstalledShell> => {
  const paths = shellPaths(directory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  // Without its relay an agent's hooks and MCP server can't start; shells still work.
  await installRelay(relay, paths.relay).catch((error: unknown) => {
    console.error("NovaDeck's relay is unavailable:", error)
  })
  await Promise.all(staleShellFiles(directory).map((stale) => rm(stale, { force: true })))
  // Plugins name the MCP launcher by its short name on Windows, as cmd starts it.
  const mcp =
    process.platform === "win32" ? join(await shortName(directory), basename(paths.mcp)) : paths.mcp
  for (const file of shellFiles(paths, process.platform, { mcp })) {
    // eslint-disable-next-line no-await-in-loop -- A few small files, one after another.
    await mkdir(dirname(file.path), { recursive: true, mode: 0o700 })
    // eslint-disable-next-line no-await-in-loop -- Unchanged files are left alone.
    const current = await readFile(file.path, "utf8").catch(() => undefined)
    if (current === file.content) {
      // eslint-disable-next-line no-await-in-loop -- Keeps the launcher runnable.
      await chmod(file.path, file.mode).catch(() => {})
      continue
    }
    const temporary = `${file.path}.${process.pid}.tmp`
    // eslint-disable-next-line no-await-in-loop -- As above.
    await writeFile(temporary, file.content, { mode: file.mode })
    // eslint-disable-next-line no-await-in-loop -- As above.
    await rename(temporary, file.path)
  }
  // A resume command left by a runner that stopped before its shell took it is stale.
  await rm(paths.resume, { recursive: true, force: true })
  await mkdir(paths.resume, { recursive: true, mode: 0o700 })
  return { ...paths, launcher: await shortName(paths.hook) }
}

/**
 * Copies the relay to `path` when it differs. Agents run the copy for as long as their
 * sessions last, so it is replaced, never written over: where it runs, the new copy is
 * renamed over it, which POSIX allows, and Windows once the running one is moved aside;
 * copies moved aside earlier go once nothing runs them.
 */
const installRelay = async (relay: string, path: string): Promise<void> => {
  const [binary, current] = await Promise.all([
    readFile(relay),
    readFile(path).catch(() => undefined),
  ])
  const folder = dirname(path)
  const aside = `${basename(path)}.old-`
  for (const name of await readdir(folder)) {
    // eslint-disable-next-line no-await-in-loop -- Rarely more than one; a running one stays.
    if (name.startsWith(aside)) await rm(join(folder, name), { force: true }).catch(() => {})
  }
  if (current?.equals(binary)) {
    await chmod(path, 0o700)
    return
  }
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, binary, { mode: 0o700 })
  if (process.platform === "win32" && current !== undefined) {
    await rename(path, join(folder, `${aside}${Date.now()}`))
  }
  await rename(temporary, path)
}

// cmd's `for` gives a path's short name, as Windows keeps one on most volumes; a path
// that still needs quoting stays as it is.
const shortName = async (path: string): Promise<string> => {
  if (process.platform !== "win32" || /^[\w.:\\-]+$/.test(path)) return path
  try {
    // Verbatim, as Node would escape the inner quotes in a way cmd does not read.
    const { stdout } = await promisify(execFile)(
      process.env.COMSPEC || "cmd.exe",
      ["/d", "/s", "/c", `"for %A in ("${path}") do @echo %~sA"`],
      { windowsHide: true, windowsVerbatimArguments: true },
    )
    const short = stdout.trim()
    return /^[\w.:\\~-]+$/.test(short) ? short : path
  } catch {
    return path
  }
}
