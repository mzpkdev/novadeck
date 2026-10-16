import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

// The lint fence around the harness packages (`.oxlintrc.json`) names each package's
// neighbours by hand, as oxlint can't say "every other adapter": this checks that a package
// added under harnesses/ is fenced in, and fenced off from the others, before it lands.

type Rule = {
  readonly paths?: readonly { readonly name: string }[]
  readonly patterns?: readonly { readonly group: readonly string[] }[]
}
type Override = {
  readonly files: readonly string[]
  readonly rules?: { readonly "no-restricted-imports"?: readonly [string, Rule?] }
}

const root = join(import.meta.dirname, "..", "..")
const config = JSON.parse(readFileSync(join(root, ".oxlintrc.json"), "utf8")) as {
  readonly overrides: readonly Override[]
}
const adapters = readdirSync(join(root, "harnesses")).filter(
  (name) => name !== "core" && existsSync(join(root, "harnesses", name, "package.json")),
)

/** Every import the fence of a package forbids, by name or pattern; none where it's off. */
const banned = (folder: string): readonly string[] => {
  const [severity, rule] = config.overrides.find((each) =>
    each.files.includes(`harnesses/${folder}/**`),
  )?.rules?.["no-restricted-imports"] ?? ["off"]
  if (severity !== "error") return []
  return [
    ...(rule?.paths ?? []).map(({ name }) => name),
    ...(rule?.patterns ?? []).flatMap(({ group }) => group),
  ]
}

const runner = ["@novadeck/runner", "@novadeck/runner/**"]
const adapter = (id: string) => [`@novadeck/harness-${id}`, `@novadeck/harness-${id}/**`]

describe("the harness packages' lint fence", () => {
  it("finds the adapters", () => {
    expect(adapters).toEqual(expect.arrayContaining(["agy", "claude", "codex"]))
  })

  it.each(adapters)("keeps %s off the runner, the other adapters and what lies above it", (id) => {
    const others = adapters.filter((other) => other !== id).flatMap(adapter)
    expect(banned(id)).toEqual(expect.arrayContaining([...runner, ...others, "../**", "./../**"]))
  })

  it("keeps harness-core off the runner and every adapter", () => {
    expect(banned("core")).toEqual(
      expect.arrayContaining([...runner, ...adapters.flatMap(adapter)]),
    )
  })
})

// The fence around libraries/ and the UI's browser code. When several overrides match a file,
// oxlint takes `no-restricted-imports` from the last one alone, dropping the earlier ones'
// lists, so each library's override repeats the bans every library shares. Reading the config
// can't show what a file ends up with, so this lints probe files at those paths with the real
// config and reads back which of their imports oxlint refuses.

/** Each library, and the libraries its design lets it import (its `depends_on`). */
const order: Readonly<Record<string, readonly string[]>> = {
  "build-kit": [],
  emulator: [],
  sandbox: [],
  terminal: ["emulator"],
  "tui-input": ["emulator"],
  viewers: [],
  wire: [],
}
const names = Object.keys(order)

/** The app's own packages: everything in application/ and harnesses/, and the atlas. */
const appPackages = [
  ...["application", "harnesses"].flatMap((folder) =>
    readdirSync(join(root, folder)).map((name) => join(root, folder, name, "package.json")),
  ),
  join(root, "atlas", "package.json"),
]
  .filter((file) => existsSync(file))
  .map((file) => (JSON.parse(readFileSync(file, "utf8")) as { name: string }).name)
const app = [
  ...appPackages.flatMap((name) => [name, `${name}/sub`]),
  "../../../../application/runner/src/manager.ts",
  "../../../../harnesses/core/src/box.ts",
  "../../../../libraries/wire/src/index.ts",
]
const library = (name: string) => [`@novadeck/${name}`, `@novadeck/${name}/sub`]
const node = ["pty", "host", "server", "electron", "browser/host"].map(
  (sub) => `@novadeck/terminal/${sub}`,
)
const browser = [
  "@novadeck/terminal",
  "@novadeck/terminal/view",
  "@novadeck/wire/client",
  "@novadeck/viewers/browser",
]
const own = ["./sibling.ts", "../index.ts", "node:path", "@xterm/xterm"]

/** The probes: a file path, everything it imports, and what the fence must refuse. */
const probes = [
  ...names.flatMap((name) => {
    const imports = [...app, ...names.flatMap(library), ...own]
    const allowed = new Set([name, ...(order[name] ?? [])].flatMap(library))
    const refused = [...app, ...names.flatMap(library).filter((each) => !allowed.has(each))]
    return [`libraries/${name}/src/probe.ts`, `libraries/${name}/src/deep/probe.test.ts`].map(
      (file) => ({ file, imports, refused }),
    )
  }),
  // A library not in the order yet still keeps off app code.
  {
    file: "libraries/unlisted/src/probe.ts",
    imports: [...app, ...names.flatMap(library), ...own],
    refused: app,
  },
  ...["application/ui/src/probe.ts", "application/ui/src/deep/probe.test.tsx"].map((file) => ({
    file,
    imports: [...node, ...browser, "../../../../libraries/terminal/src/view.ts", ...own],
    refused: [...node, "../../../../libraries/terminal/src/view.ts"],
  })),
]

let refusals: ReadonlyMap<string, readonly string[]> = new Map()
let workspace = ""

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "novadeck-fence-"))
  writeFileSync(join(workspace, ".oxlintrc.json"), readFileSync(join(root, ".oxlintrc.json")))
  for (const { file, imports } of probes) {
    mkdirSync(dirname(join(workspace, file)), { recursive: true })
    writeFileSync(join(workspace, file), imports.map((each) => `import "${each}"\n`).join(""))
  }
  const oxlint = join(root, "node_modules", "oxlint", "bin", "oxlint")
  // oxlint exits non-zero on the refusals it's here to find.
  const output = (() => {
    try {
      return execFileSync(process.execPath, [oxlint, "--format", "json", "."], {
        cwd: workspace,
        encoding: "utf8",
      })
    } catch (error) {
      return (error as { stdout: string }).stdout
    }
  })()
  const { diagnostics } = JSON.parse(output) as {
    diagnostics: readonly { code: string; message: string; filename: string }[]
  }
  const found = new Map<string, string[]>()
  for (const { code, message, filename } of diagnostics) {
    const name = /^'(.+)' import is restricted/.exec(message)?.[1]
    if (code !== "eslint(no-restricted-imports)" || !name) continue
    const file = filename.replaceAll("\\", "/")
    found.set(file, [...(found.get(file) ?? []), name])
  }
  refusals = found
})

afterAll(() => rmSync(workspace, { recursive: true, force: true }))

describe("the libraries' lint fence", () => {
  it("knows the order of every library in libraries/", () => {
    const folders = existsSync(join(root, "libraries"))
      ? readdirSync(join(root, "libraries")).filter((name) =>
          existsSync(join(root, "libraries", name, "package.json")),
        )
      : []
    expect(names).toEqual(expect.arrayContaining(folders))
  })

  it.each(probes.filter(({ file }) => file.startsWith("libraries/")))(
    "refuses $file exactly app code and the libraries outside its order",
    ({ file, refused }) => {
      expect((refusals.get(file) ?? []).toSorted()).toEqual(refused.toSorted())
    },
  )
})

describe("the browser code's lint fence", () => {
  it.each(probes.filter(({ file }) => file.startsWith("application/")))(
    "refuses $file exactly the libraries' Node subpaths and paths into libraries/",
    ({ file, refused }) => {
      expect((refusals.get(file) ?? []).toSorted()).toEqual(refused.toSorted())
    },
  )
})
