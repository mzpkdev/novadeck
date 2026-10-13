import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const newest = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
    const path = join(dir, entry.name)
    return Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs)
  }, 0)

// The extractor reads the contract from the built protocol package; build it when it is
// missing or older than its source. The build's own output goes to stderr, so a failing
// build explains itself and stdout stays the caller's.
export const ensureProtocol = (repo: string): void => {
  const protocol = join(repo, "application/protocol")
  const built = join(protocol, "dist/index.js")
  if (existsSync(built) && statSync(built).mtimeMs >= newest(join(protocol, "src"))) return
  process.stderr.write("atlas: building @novadeck/protocol…\n")
  const windows = process.platform === "win32"
  execFileSync(windows ? "pnpm.cmd" : "pnpm", ["--filter", "@novadeck/protocol", "build"], {
    cwd: repo,
    stdio: ["ignore", 2, 2],
    shell: windows,
  })
}
