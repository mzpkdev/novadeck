import { spawnSync } from "node:child_process"
import { rmSync } from "node:fs"

import { describe, expect, it } from "../test.js"
import { createSandbox, keychainAsks, unsuffixedClaudeItem } from "./sandbox.js"

describe("Claude Code's Keychain items", () => {
  it("are the person's own without a folder's suffix, and the sandbox's with one", () => {
    expect(unsuffixedClaudeItem.test("Claude Code-credentials")).toBe(true)
    expect(unsuffixedClaudeItem.test("Claude Code")).toBe(true)
    expect(unsuffixedClaudeItem.test("Claude Code-local-oauth-credentials")).toBe(true)
    expect(unsuffixedClaudeItem.test("Claude Code-credentials-1a2b3c4d")).toBe(false)
    expect(unsuffixedClaudeItem.test("Claude Code-1a2b3c4d")).toBe(false)
    expect(unsuffixedClaudeItem.test("gemini")).toBe(false)
  })
})

describe.runIf(process.platform === "darwin")("the sandbox's security on macOS", () => {
  it("refuses Claude Code the person's own item, passes the rest, and says what was asked", ({
    resources,
  }) => {
    const sandbox = createSandbox({ proxy: "http://127.0.0.1:9", bins: [] })
    resources.defer(() => rmSync(sandbox.root, { recursive: true, force: true }))
    // As Claude Code asks: `security` by name, through the sandbox's PATH.
    const ask = (service: string) =>
      spawnSync("/bin/sh", ["-c", `security find-generic-password -a novadeck -s "${service}"`], {
        env: sandbox.env,
        stdio: "ignore",
      }).status

    expect(ask("Claude Code-credentials")).toBe(44)
    // Passed on to the real one, which holds no such item in any Keychain.
    expect(ask("Claude Code-credentials-1a2b3c4d")).toBe(44)
    expect(ask("novadeck-e2e-nothing")).toBe(44)
    expect(keychainAsks(sandbox)).toEqual([
      "Claude Code-credentials",
      "Claude Code-credentials-1a2b3c4d",
      "novadeck-e2e-nothing",
    ])
  })
})
