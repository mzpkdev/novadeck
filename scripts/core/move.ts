import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, posix } from "node:path"

// `node scripts/core/move.ts`: moves the UI's model into `application/ui/src/core/`, with the
// files that go with it, and points every importer at the new place. It works out what to do
// from the tree it finds, so it runs again on a fresh main. See scripts/core/README.md.

const root = join(import.meta.dirname, "..", "..")
const ui = "application/ui/src"
const core = `${ui}/core`

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })

if (git("status", "--porcelain").trim() !== "") {
  console.error("The working tree isn't clean: commit or discard its changes first.")
  process.exit(1)
}
if (existsSync(join(root, core))) {
  console.error(`${core} already exists: the move is done. Reset to main to run it again.`)
  process.exit(1)
}

const tracked = git("ls-files", "-z").split("\0").filter(Boolean)
const trackedSet = new Set(tracked)

// Everything that moves, as old path -> new path, from the repository root.
const moves = new Map<string, string>()
for (const file of tracked)
  if (file.startsWith(`${ui}/model/`))
    moves.set(file, `${core}/${file.slice(`${ui}/model/`.length)}`)
// The pieces the backends share, which the core holds.
for (const name of ["registry", "portable-card-raised"])
  for (const suffix of ["ts", "test.ts"]) {
    const file = `${ui}/backend/${name}.${suffix}`
    if (trackedSet.has(file)) moves.set(file, `${core}/${name}.${suffix}`)
  }
// The boot rehearsal is the demo's debug panel's alone.
for (const suffix of ["ts", "test.ts"]) {
  const file = `${ui}/backend/boot-rehearsal.${suffix}`
  if (trackedSet.has(file)) moves.set(file, `${ui}/backend/demo/debug/boot-rehearsal.${suffix}`)
}
for (const [from, to] of moves) {
  if (trackedSet.has(to)) throw new Error(`${from} would land on ${to}, which is there already.`)
  // `#core/*` maps to `.ts` files.
  if (to.startsWith(`${core}/`) && !to.endsWith(".ts"))
    throw new Error(`${to}: the core holds only .ts files, as the #core/* mapping says.`)
}
if (moves.size === 0) throw new Error("Nothing to move: there is no model/ here.")

const destination = (file: string): string => moves.get(file) ?? file
const inCore = (file: string): boolean => file.startsWith(`${core}/`)

// A relative specifier names a file as written: with an extension, without one, or by the
// folder's index. The suffix says how, so the new specifier is written the same way.
const suffixes = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"]
const resolve = (from: string, specifier: string): { file: string; suffix: string } | undefined => {
  const bare = specifier.replace(/[?#].*$/, "")
  const target = posix.normalize(posix.join(posix.dirname(from), bare))
  for (const suffix of suffixes) {
    if (trackedSet.has(`${target}${suffix}`)) return { file: `${target}${suffix}`, suffix }
  }
  return undefined
}
const withoutSuffix = (file: string, suffix: string): string =>
  suffix === "" ? file : file.slice(0, -suffix.length)

// Every quoted relative specifier, whatever carries it. The form is the text before it:
// `from`, `import(`, a bare `import`, `vi.mock(`... Anything else is reported to be looked at.
const literal = /(["'`])(\.{1,2}\/[^"'`\n]*)\1/g
const formOf = (before: string): string => {
  if (/\bfrom\s*$/.test(before)) return "from"
  if (/\bimport\s*\(\s*$/.test(before)) return "import()"
  if (/\bimport\s*$/.test(before)) return "import"
  const call = /\b(\w+)\s*\(\s*$/.exec(before)
  return call ? `${call[1]}()` : "other"
}

const forms = new Map<string, number>()
const rewrites = new Map<string, string>()
const sourceFile = /\.(?:ts|tsx|mts|cts)$/

for (const file of tracked) {
  if (!sourceFile.test(file) || file.includes("node_modules/")) continue
  const text = readFileSync(join(root, file), "utf8")
  const to = destination(file)
  let changed = false
  const next = text.replace(literal, (whole, quote: string, specifier: string, offset: number) => {
    const target = resolve(file, specifier)
    if (!target) return whole
    const targetTo = destination(target.file)
    if (targetTo === target.file && to === file) return whole
    const query = /[?#].*$/.exec(specifier)?.[0] ?? ""
    const place = withoutSuffix(targetTo, target.suffix)
    let written: string
    if (inCore(targetTo) && to.startsWith(`${ui}/`) && !inCore(to)) {
      // The package's own `imports`, which step 5 turns into the core package's name.
      written = `#core/${place.slice(core.length + 1)}`
    } else {
      const relative = posix.relative(posix.dirname(to), place)
      written = relative.startsWith(".") ? relative : `./${relative}`
    }
    if (`${written}${query}` === specifier) return whole
    const form = formOf(text.slice(Math.max(0, offset - 40), offset))
    forms.set(form, (forms.get(form) ?? 0) + 1)
    if (form === "other") console.warn(`look at ${file}: ${whole}`)
    changed = true
    return `${quote}${written}${query}${quote}`
  })
  if (changed) rewrites.set(file, next)
}

// Paths written out in full in scripts, docs and tests: `ui/src/model/` and the moved files.
const textual = [...moves].map(
  ([from, to]) => [from.slice(from.indexOf("src/")), to.slice(to.indexOf("src/"))] as const,
)
const ignored =
  /(?:^|\/)(?:pnpm-lock\.yaml|node_modules|scripts\/core\/)|\.(?:png|jpe?g|webp|ico|woff2?|zip)$/

const moved = new Set(moves.keys())
const touched = new Set<string>()
for (const file of tracked) {
  if (ignored.test(file) || moved.has(file) || file.startsWith(`${ui}/`)) continue
  let text = rewrites.get(file) ?? readFileSync(join(root, file), "utf8")
  let next = text.replaceAll("ui/src/model/", "ui/src/core/")
  for (const [from, to] of textual) next = next.replaceAll(from, to)
  // The same paths written for a regular expression.
  next = next.replaceAll("ui\\/src\\/model\\/", "ui\\/src\\/core\\/")
  if (next !== text) rewrites.set(file, next)
}

// Rewrite in place at the old paths, move, then settle each file's text at its new path.
for (const [file, text] of rewrites) writeFileSync(join(root, file), text)
for (const [from, to] of moves) {
  mkdirSync(join(root, dirname(to)), { recursive: true })
  git("mv", from, to)
}
for (const file of rewrites.keys()) touched.add(destination(file))
for (const file of moves.values()) touched.add(file)

execFileSync("pnpm", ["exec", "oxfmt", ...touched], { cwd: root, stdio: "inherit" })

const count = (prefix: string): number =>
  [...moves.values()].filter((to) => to.startsWith(prefix)).length
console.log(
  `moved ${moves.size} files (${count(`${core}/`)} into core/, ${count(`${ui}/backend/demo/`)} into the demo's debug/);` +
    ` rewrote ${rewrites.size} files.`,
)
console.log(
  `specifiers by form: ${[...forms].map(([form, n]) => `${form} ${n}`).join(", ") || "none"}`,
)
console.log("Next: pnpm typecheck && pnpm lint && pnpm test (see scripts/core/README.md).")
