import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"

import { describe, expect, it as base } from "../test.js"
import { installShellFiles } from "./install.js"
import { codexHookOverride, hookCommand, type ShellPaths } from "./scripts.js"

const windows = process.platform === "win32"

type Fixture = {
  paths: ShellPaths
  /** A directory holding a real `claude` and `codex` that record their arguments. */
  real: string
  run: (program: string, args: string[], env?: NodeJS.ProcessEnv) => string[]
}

const it = base.extend<{ shims: Fixture }>({
  shims: async ({ resources }, use) => {
    const root = mkdtempSync(join(tmpdir(), "novadeck-shims-"))
    resources.defer(() => rmSync(root, { recursive: true, force: true }))
    const paths = await installShellFiles(join(root, "shell"))
    const real = join(root, "real")
    const log = join(root, "args.json")
    mkdirSync(real)
    // The real programs are Node scripts that record the arguments they received.
    const recorder = join(root, "record.cjs")
    writeFileSync(
      recorder,
      `require("node:fs").writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)))`,
    )
    for (const program of ["claude", "codex"]) {
      if (windows) {
        writeFileSync(join(real, `${program}.cmd`), `@"${process.execPath}" "${recorder}" %*\r\n`)
      } else {
        writeFileSync(
          join(real, program),
          `#!/bin/sh\nexec "${process.execPath}" "${recorder}" "$@"\n`,
        )
        chmodSync(join(real, program), 0o755)
      }
    }
    const run: Fixture["run"] = (program, args, env = {}) => {
      rmSync(log, { force: true })
      const path = [paths.bin, real, process.env.PATH].join(delimiter)
      const shim = join(paths.bin, windows ? `${program}.cmd` : program)
      const result = windows
        ? spawnSync("cmd.exe", ["/d", "/c", shim, ...args], {
            env: { ...process.env, PATH: path, ...env },
            encoding: "utf8",
          })
        : spawnSync(shim, args, { env: { ...process.env, PATH: path, ...env }, encoding: "utf8" })
      if (result.status !== 0) throw new Error(`${program} failed: ${result.stderr}`)
      return JSON.parse(readFileSync(log, "utf8")) as string[]
    }
    await use({ paths, real, run })
  },
})

const inside = { NOVADECK_TERMINAL_ID: "00000000-0000-4000-8000-000000000001" }
const outside = { NOVADECK_TERMINAL_ID: "", NOVADECK_AGENT: "" }

describe("agent hook command", () => {
  // Codex trusts a hook by a hash of its definition: changing this string, or the rest
  // of the override, asks every user to review NovaDeck's hook again.
  it("stays byte-identical across versions", () => {
    expect(hookCommand("codex", "linux")).toBe('"$NOVADECK_HOOK" codex')
    expect(hookCommand("codex", "win32")).toBe('"%NOVADECK_HOOK%" codex')
    expect(codexHookOverride("linux")).toBe(
      `hooks.SessionStart=[{matcher='startup|resume|clear|compact',hooks=[{type='command',command='"$NOVADECK_HOOK" codex'}]}]`,
    )
  })
})

describe("agent shims", () => {
  it("run the real claude with the per-run plugin and every argument as given", ({ shims }) => {
    const args = windows ? ["--resume", "abc", "two words"] : ["a b", "", '"q"', "$x", "--", "-p"]
    expect(shims.run("claude", args, inside)).toEqual([
      "--plugin-dir",
      shims.paths.claudePlugin,
      ...args,
    ])
  })

  it("run the real codex with the per-run SessionStart hook", ({ shims }) => {
    expect(shims.run("codex", ["resume", "abc"], inside)).toEqual([
      "-c",
      codexHookOverride(),
      "resume",
      "abc",
    ])
  })

  it("add nothing outside NovaDeck's terminals, or inside an agent a shim started", ({ shims }) => {
    expect(shims.run("claude", ["--version"], outside)).toEqual(["--version"])
    expect(shims.run("codex", ["--version"], { ...inside, NOVADECK_AGENT: "claude" })).toEqual([
      "--version",
    ])
  })
})
