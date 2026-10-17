import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const newest = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
    const path = join(dir, entry.name)
    return Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs)
  }, 0)

// The extractor reads the contract from the built protocol package, which imports the built
// terminal library; build each when it is missing or older than its source, the library
// first. Each runs its package's own build (`tsc -p tsconfig.build.json`) with the
// TypeScript the package resolves, through Node: not through pnpm, which may first run an
// install, and which is a different executable on Windows. The build's own output goes to
// stderr, so a failing build explains itself and stdout stays the caller's.
const ensureBuilt = (folder: string, name: string): void => {
  const built = join(folder, "dist/index.js")
  if (existsSync(built) && statSync(built).mtimeMs >= newest(join(folder, "src"))) return
  process.stderr.write(`atlas: building ${name}…\n`)
  const typescript = createRequire(join(folder, "package.json")).resolve("typescript/package.json")
  const tsc = join(dirname(typescript), "bin/tsc")
  // `--noEmitOnError`: a failed build leaves the old output stale, so the next call
  // rebuilds and fails again, instead of finding fresh output built from broken source.
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json", "--noEmitOnError"], {
    cwd: folder,
    stdio: ["ignore", 2, 2],
  })
}

export const ensureProtocol = (repo: string): void => {
  ensureBuilt(join(repo, "libraries/terminal"), "@novadeck/terminal")
  ensureBuilt(join(repo, "application/protocol"), "@novadeck/protocol")
}
