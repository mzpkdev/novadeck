import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { hookScript } from "./hook.js"
import { shellFiles, shellPaths, type ShellPaths } from "./scripts.js"

/**
 * Writes the shell integration, shims, hook and Claude Code plugin into NovaDeck's own
 * directory, each only when it changed, replacing it whole so a shell starting at that
 * moment reads the old or the new file.
 */
export const installShellFiles = async (
  directory: string,
  runtime = process.execPath,
): Promise<ShellPaths> => {
  const paths = shellPaths(directory)
  for (const file of shellFiles(paths, runtime, hookScript)) {
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
  return paths
}
