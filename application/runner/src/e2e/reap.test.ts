import { spawn } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "../test.js"
import { reap } from "./reap.js"

describe.skipIf(process.platform !== "linux")("reap", () => {
  it("ends a process left in the sandbox, naming it, and one stopped as stopped", async ({
    resources,
  }) => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-reap-")))
    resources.defer(() => rmSync(root, { recursive: true, force: true }))
    const sandbox = { root, home: join(root, "home"), started: 0 }
    const leak = () => {
      const child = spawn("sleep", ["60"], { cwd: root, env: {}, stdio: "ignore" })
      resources.defer(() => {
        child.kill("SIGKILL")
      })
      return child.pid!
    }
    const running = leak()
    const stopped = leak()
    process.kill(stopped, "SIGSTOP")

    const leftovers = await reap(sandbox)

    expect(leftovers.toSorted()).toEqual(
      [`sleep (${running})`, `sleep (${stopped}, stopped)`].toSorted(),
    )
    expect(await reap(sandbox)).toEqual([])
  })
})

describe.skipIf(process.platform !== "win32")("reap on Windows", () => {
  it("ends what runs in the sandbox or has its home, naming it, and nothing else", async ({
    resources,
  }) => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-reap-")))
    const elsewhere = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-reap-other-")))
    resources.defer(() => rmSync(root, { recursive: true, force: true, maxRetries: 5 }))
    resources.defer(() => rmSync(elsewhere, { recursive: true, force: true, maxRetries: 5 }))
    const sandbox = { root, home: join(root, "home"), started: Date.now() }
    const start = (cwd: string, env: NodeJS.ProcessEnv) => {
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"], {
        cwd,
        env: { SystemRoot: process.env.SystemRoot, ...env },
        stdio: "ignore",
      })
      resources.defer(() => {
        child.kill()
      })
      return child
    }
    const inside = start(root, {})
    const homed = start(elsewhere, { HOME: sandbox.home })
    const other = start(elsewhere, { HOME: elsewhere })
    // Each has started, so its parameters are there to read.
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const leftovers = await reap(sandbox)

    expect(leftovers.toSorted()).toEqual(
      [`node.exe (${inside.pid})`, `node.exe (${homed.pid})`].toSorted(),
    )
    expect(other.exitCode).toBeNull()
    expect(await reap(sandbox)).toEqual([])
  }, 60_000)
})
