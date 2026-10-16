import { spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import { delimiter, join } from "node:path"

import { describe, expect, it, onTestFinished } from "vitest"

import { createSandbox, type SandboxOptions } from "./sandbox.js"

const windows = process.platform === "win32"

const made = (options: Partial<SandboxOptions> = {}) => {
  const sandbox = createSandbox({ prefix: "sandbox-test-", bins: [], ...options })
  onTestFinished(() => rmSync(sandbox.root, { recursive: true, force: true }))
  return sandbox
}

// The first sandbox on Windows asks git and PowerShell 7 where they're installed, which a
// cold runner may take seconds to answer.
describe("a sandbox", { timeout: 60_000 }, () => {
  it("keeps its home, project and temporary folder inside its root", () => {
    const sandbox = made()

    expect(sandbox.home).toBe(join(sandbox.root, "home"))
    expect(sandbox.project).toBe(join(sandbox.root, "project"))
    expect(sandbox.env.HOME).toBe(sandbox.home)
    for (const name of ["TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "NPM_CONFIG_PREFIX"])
      expect(sandbox.env[name]?.startsWith(sandbox.root)).toBe(true)
  })

  it("passes on nothing of the caller's environment", () => {
    process.env.SANDBOX_TEST_SECRET = "leaked"
    onTestFinished(() => {
      delete process.env.SANDBOX_TEST_SECRET
    })

    const { env } = made()

    expect(Object.values(env)).not.toContain("leaked")
    expect(env.PATH).not.toContain(process.env.PATH)
  })

  it("puts the programs under test first on PATH, then Node through a folder of its own", () => {
    const sandbox = made({ bins: ["/opt/under-test/bin"] })
    const path = sandbox.env.PATH!.split(delimiter)

    expect(path[0]).toBe("/opt/under-test/bin")
    expect(path[1]).toBe(join(sandbox.root, "node"))
  })

  it("names the user it is given, and sandbox otherwise", () => {
    expect(made({ user: "ada" }).env.USER).toBe("ada")
    expect(made().env.USER).toBe("sandbox")
  })

  it("sends every program through the proxy it is given, loopback exempt", () => {
    const { env } = made({ proxy: "http://127.0.0.1:9" })

    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:9")
    expect(env.https_proxy).toBe("http://127.0.0.1:9")
    expect(env.NO_PROXY).toBe("127.0.0.1,localhost")
    expect(env.NODE_USE_ENV_PROXY).toBe("1")
  })

  it("sets no proxy where none is given", () => {
    const { env } = made()

    expect(Object.keys(env).filter((name) => /proxy/i.test(name))).toEqual([])
  })

  it("is named with its prefix, a space and all", () => {
    expect(made({ prefix: "sandbox test-" }).home).toContain("sandbox test-")
  })

  it.skipIf(windows)("runs Node from its own PATH with its home", () => {
    const sandbox = made()

    const { stdout } = spawnSync(
      "/bin/sh",
      ["-c", 'node -e "console.log(require(\\"node:os\\").homedir())"'],
      { env: sandbox.env, encoding: "utf8" },
    )

    expect(stdout.trim()).toBe(sandbox.home)
  })
})
