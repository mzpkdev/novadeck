import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { isLibraryName, template, type Versions } from "./template.ts"

// `pnpm new:library <name> <description>`: writes a new library into libraries/<name> from
// the template. The import fence doesn't know it yet: add it to the order in
// scripts/harnesses/fence.test.ts and give it its override in .oxlintrc.json.

const root = join(import.meta.dirname, "..", "..")
const [name, ...words] = process.argv.slice(2)
const description = words.join(" ")

if (!name || !isLibraryName(name) || !description) {
  console.error("usage: pnpm new:library <name> <description>, the name in lower-case-words")
  process.exit(1)
}

const folder = join(root, "libraries", name)
if (existsSync(folder)) {
  console.error(`libraries/${name} already exists.`)
  process.exit(1)
}

const { devDependencies } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  devDependencies: Versions
}
for (const [path, content] of Object.entries(template(name, description, devDependencies))) {
  mkdirSync(dirname(join(folder, path)), { recursive: true })
  writeFileSync(join(folder, path), content)
}
// In the repository's own style, as the template's JSON is written plainly.
execFileSync(process.execPath, [join(root, "node_modules", "oxfmt", "bin", "oxfmt"), folder], {
  stdio: "ignore",
})
console.log(
  `Wrote libraries/${name}. Next: pnpm install, then fence it in (see libraries/README.md).`,
)
