import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs"
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

try {
  execFileSync("pnpm", ["exec", "oxfmt", "--version"], { cwd: root, stdio: "ignore" })
} catch {
  console.error("oxfmt can't run here (pnpm install?), and the move formats what it changes.")
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

// What the script can't write for the core goes here and stops the run before it changes
// anything: a person decides.
const problems: string[] = []

// A relative specifier names a file as written: with its extension, without one, as `.js`
// for the `.ts` file, or by the folder's index. The form says how, so the new specifier is
// written the same way.
type Named = { file: string; form: "exact" | "extension" | "js" | "index"; ending: string }
const resolve = (from: string, specifier: string): Named | undefined => {
  const bare = specifier.replace(/[?#].*$/, "")
  const target = posix.normalize(posix.join(posix.dirname(from), bare))
  if (trackedSet.has(target)) return { file: target, form: "exact", ending: "" }
  for (const ending of [".ts", ".tsx"])
    if (trackedSet.has(`${target}${ending}`))
      return { file: `${target}${ending}`, form: "extension", ending }
  const js = /\.(?:js|mjs|cjs)$/.exec(target)?.[0]
  if (js)
    for (const ending of [".ts", ".tsx", ".mts"])
      if (trackedSet.has(target.slice(0, -js.length) + ending))
        return { file: target.slice(0, -js.length) + ending, form: "js", ending: js }
  for (const ending of ["/index.ts", "/index.tsx"])
    if (trackedSet.has(`${target}${ending}`))
      return { file: `${target}${ending}`, form: "index", ending }
  return undefined
}
const withoutExtension = (file: string): string => file.replace(/\.(?:ts|tsx|mts)$/, "")

// Every quoted relative specifier, whatever carries it. The form is the text before it:
// `from`, `import(`, a bare `import`, `vi.mock(`... Anything else is reported to be looked at.
const literal = /(["'`])(\.{1,2}\/[^"'`\n]*)\1/g
const formOf = (before: string): string => {
  if (/\bfrom\s*$/.test(before)) return "from"
  if (/\bimport\s*\(\s*$/.test(before)) return "import()"
  if (/\bimport\s*$/.test(before)) return "import"
  if (/\bnew\s+URL\s*\(\s*$/.test(before)) return "new URL()"
  const call = /\b(\w+)\s*\(\s*$/.exec(before)
  return call ? `${call[1]}()` : "other"
}

// A folder all of whose files move: a pattern that reaches into one (a template import, a
// glob) can't be followed, so it stops the run.
const trackedIn = (dir: string): string[] => tracked.filter((file) => file.startsWith(`${dir}/`))
const movedFolders = new Set(
  [...moves.keys()]
    .map((file) => posix.dirname(file))
    .filter((dir) => trackedIn(dir).every((file) => moves.has(file))),
)
const reachesMoved = (from: string, pattern: string): boolean => {
  const prefix = pattern.split("${")[0]!.replace(/[*?{[].*$/, "")
  const folder = posix.normalize(
    posix.join(posix.dirname(from), prefix.slice(0, prefix.lastIndexOf("/") + 1) || "."),
  )
  return [...movedFolders].some((dir) => folder === dir || folder.startsWith(`${dir}/`))
}
const patterns = [
  { name: "template import", pattern: /\bimport\s*\(\s*`(\.{1,2}\/[^`]*\$\{[^`]*)`/g },
  {
    name: "import.meta.glob",
    pattern: /\bimport\.meta\.glob\w*\s*\(\s*\[?\s*["'`](\.{1,2}\/[^"'`]*)["'`]/g,
  },
]

const forms = new Map<string, number>()
const rewrites = new Map<string, string>()
const sourceFile = /\.(?:ts|tsx|mts|cts)$/

for (const file of tracked) {
  if (!sourceFile.test(file) || file.includes("node_modules/")) continue
  const text = readFileSync(join(root, file), "utf8")
  const to = destination(file)
  for (const { name, pattern } of patterns)
    for (const match of text.matchAll(pattern))
      if (reachesMoved(file, match[1]!))
        problems.push(`${file}: a ${name} reaches into the moved files: ${match[1]}`)
  let changed = false
  const next = text.replace(literal, (whole, quote: string, specifier: string, offset: number) => {
    const target = resolve(file, specifier)
    if (!target) return whole
    const targetTo = destination(target.file)
    if (targetTo === target.file && to === file) return whole
    const query = /[?#].*$/.exec(specifier)?.[0] ?? ""
    const form = formOf(text.slice(Math.max(0, offset - 40), offset))
    const viaCore =
      inCore(targetTo) && to.startsWith(`${ui}/`) && !inCore(to) && form !== "new URL()"
    let written: string
    if (viaCore) {
      // The package's own `imports`, which step 5 turns into the core package's name. Its
      // mapping serves `.ts` files by their extensionless name, and nothing else.
      if (target.form === "index" || query !== "") {
        problems.push(`${file}: ${whole} can't be written as #core/*`)
        return whole
      }
      written = `#core/${withoutExtension(targetTo).slice(core.length + 1)}`
    } else {
      const place =
        target.form === "exact"
          ? targetTo
          : target.form === "index"
            ? posix.dirname(targetTo)
            : target.form === "js"
              ? withoutExtension(targetTo) + target.ending
              : withoutExtension(targetTo)
      const relative = posix.relative(posix.dirname(to), place)
      written = relative.startsWith(".") ? relative : `./${relative}`
    }
    if (`${written}${query}` === specifier) return whole
    forms.set(form, (forms.get(form) ?? 0) + 1)
    if (form === "other") console.warn(`look at ${file}: ${whole}`)
    changed = true
    return `${quote}${written}${query}${quote}`
  })
  if (changed) rewrites.set(file, next)
}

// Paths written out in full in scripts, docs and tests, anchored at the UI's folder so a
// same-named path in another package is left alone: `ui/src/model/` and the moved files.
const textual = [...moves].map(
  ([from, to]) => [from.slice(from.indexOf("ui/src/")), to.slice(to.indexOf("ui/src/"))] as const,
)
const anchored = (path: string): RegExp =>
  new RegExp(`(?<![\\w/.-])${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g")
const ignored =
  /(?:^|\/)(?:pnpm-lock\.yaml|node_modules|scripts\/core\/)|\.(?:png|jpe?g|webp|ico|woff2?|zip)$/

const moved = new Set(moves.keys())
const touched = new Set<string>()
const outside = (file: string): boolean =>
  !ignored.test(file) && !moved.has(file) && !file.startsWith(`${ui}/`)
for (const file of tracked.filter(outside)) {
  const text = rewrites.get(file) ?? readFileSync(join(root, file), "utf8")
  let next = text.replaceAll(anchored("ui/src/model/"), "ui/src/core/")
  for (const [from, to] of textual) next = next.replaceAll(anchored(from), to)
  // The same paths written for a regular expression.
  next = next.replaceAll("ui\\/src\\/model\\/", "ui\\/src\\/core\\/")
  if (next !== text) rewrites.set(file, next)
}

if (problems.length > 0) {
  console.error(`Nothing was changed. Look at these first:\n${problems.join("\n")}`)
  process.exit(1)
}

// Rewrite in place at the old paths, move, then settle each file's text at its new path.
for (const [file, text] of rewrites) writeFileSync(join(root, file), text)
for (const [from, to] of moves) {
  mkdirSync(join(root, dirname(to)), { recursive: true })
  git("mv", from, to)
}
// Folders the move emptied of tracked files go, if nothing else is in them.
for (const dir of [...new Set([...moves.keys()].map((file) => posix.dirname(file)))]
  .toSorted()
  .toReversed())
  for (let each = dir; each.startsWith(`${ui}/`) && each !== ui; each = posix.dirname(each)) {
    try {
      rmdirSync(join(root, each))
    } catch {
      break
    }
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
// What still names a moved path, outside the UI's source, is for a person to look at.
let found = ""
try {
  found = git("grep", "-nE", "src/model/|ui/model", "--", ".", ":!scripts/core", ":!pnpm-lock.yaml")
} catch {
  // No match is the good case.
}
const leftovers = found.split("\n").filter((line) => line && !line.includes("src/e2e/model/"))
if (leftovers.length > 0)
  console.warn(`look at these mentions of the old folder:\n${leftovers.join("\n")}`)
console.log("Next: pnpm typecheck && pnpm lint && pnpm test (see scripts/core/README.md).")
