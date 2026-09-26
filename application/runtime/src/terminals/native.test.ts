import * as pty from "node-pty"

import { describe, expect, it } from "../test.js"

describe("installed native PTY dependency", () => {
  it("starts a child and delivers its final output without hiding native startup errors", async ({
    resources,
  }) => {
    // Keep this outside the API's sanitized SPAWN_FAILED boundary so CI reports
    // missing native helpers or permissions at their source.
    const child = pty.spawn(process.execPath, ["-e", 'process.stdout.write("NATIVE_PTY_OK")'], {
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
    })
    let exited = false
    resources.defer(() => {
      if (!exited) child.kill()
    })
    let output = ""
    child.onData((data) => {
      output += data
    })
    const code = await new Promise<number>((resolve) => {
      child.onExit((event) => {
        exited = true
        resolve(event.exitCode)
      })
    })
    expect(code).toBe(0)
    expect(output).toContain("NATIVE_PTY_OK")
  })
})
