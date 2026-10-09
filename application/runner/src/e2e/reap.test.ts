import { spawn } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

import { describe, expect, it } from "../test.js"
import { parseDarwinFolders, parseDarwinProcesses, reap } from "./reap.js"

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

describe.skipIf(process.platform !== "darwin")("reap on macOS", () => {
  it("ends what runs in the sandbox or has its home, naming it, and nothing else", async ({
    resources,
  }) => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-reap-")))
    const elsewhere = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-reap-other-")))
    resources.defer(() => rmSync(root, { recursive: true, force: true }))
    resources.defer(() => rmSync(elsewhere, { recursive: true, force: true }))
    const sandbox = { root, home: join(root, "home"), started: Date.now() }
    const start = (cwd: string, env: NodeJS.ProcessEnv) => {
      // Node rather than a system program such as sleep: macOS shows no environment of its
      // own programs, and the harnesses are never one.
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"], {
        cwd,
        env,
        stdio: "ignore",
      })
      resources.defer(() => {
        child.kill("SIGKILL")
      })
      return child
    }
    const name = basename(process.execPath)
    const inside = start(root, {})
    const stopped = start(root, {})
    process.kill(stopped.pid!, "SIGSTOP")
    const homed = start(elsewhere, { HOME: sandbox.home })
    const other = start(elsewhere, { HOME: elsewhere })
    // Each has started, so ps and lsof see it.
    await new Promise((resolve) => setTimeout(resolve, 500))

    const leftovers = await reap(sandbox)

    expect(leftovers.toSorted()).toEqual(
      [
        `${name} (${inside.pid})`,
        `${name} (${stopped.pid}, stopped)`,
        `${name} (${homed.pid})`,
      ].toSorted(),
    )
    expect(other.exitCode).toBeNull()
    expect(await reap(sandbox)).toEqual([])
  }, 30_000)
})

describe("macOS's process listing", () => {
  it("reads each process's pid, state, start and command's name", () => {
    const output = [
      "  412 Ss   Thu Oct  9 11:03:47 2026     /bin/bash",
      "51234 T    Fri Oct 10 09:00:01 2026     /Applications/Some App.app/Contents/MacOS/Some App",
      "  777 Z    Thu Oct  9 11:03:48 2026     (node)",
      "not a process",
    ].join("\n")

    expect(parseDarwinProcesses(output)).toEqual([
      {
        pid: 412,
        comm: "bash",
        start: new Date(2026, 9, 9, 11, 3, 47).getTime(),
        stopped: false,
        zombie: false,
      },
      {
        pid: 51234,
        comm: "Some App",
        start: new Date(2026, 9, 10, 9, 0, 1).getTime(),
        stopped: true,
        zombie: false,
      },
      {
        pid: 777,
        comm: "(node)",
        start: new Date(2026, 9, 9, 11, 3, 48).getTime(),
        stopped: false,
        zombie: true,
      },
    ])
  })

  it("reads each process's working folder from lsof's fields", () => {
    const output = ["p412", "fcwd", "n/private/tmp/novadeck e2e", "p413", "fcwd", "n/"].join("\n")

    expect(parseDarwinFolders(output)).toEqual(
      new Map([
        [412, "/private/tmp/novadeck e2e"],
        [413, "/"],
      ]),
    )
  })
})
