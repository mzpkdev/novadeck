import { describe, expect, it } from "../test.js"
import { nodeLauncherName, parseProcessStat } from "./foreground.js"

const cmdline = (...args: string[]): Buffer => Buffer.from(`${args.join("\0")}\0`)

describe("Linux foreground launcher inspection", () => {
  it("parses the controlling terminal and foreground group after a parenthesized command", () => {
    expect(parseProcessStat("42 (node ) helper) S 1 42 42 34816 99 0")).toEqual({
      pgrp: 42,
      tty: 34816,
      tpgid: 99,
    })
    expect(parseProcessStat("42 (node) S 1 invalid 42 34816 99 0")).toBeNull()
    expect(parseProcessStat("broken")).toBeNull()
  })

  it("recognizes only the script executed by a Node agent launcher", () => {
    expect(nodeLauncherName(cmdline("/usr/bin/node", "/a path/bin/codex", "--version"))).toBe(
      "codex",
    )
    expect(nodeLauncherName(cmdline("/usr/bin/node", "/pkg/@openai/codex/bin/codex.js"))).toBe(
      "codex",
    )
    expect(
      nodeLauncherName(cmdline("/usr/bin/nodejs", "/pkg/@anthropic-ai/claude-code/cli.js")),
    ).toBe("claude")
    expect(nodeLauncherName(cmdline("/usr/bin/node", "/tmp/server.js", "codex"))).toBeNull()
    expect(nodeLauncherName(cmdline("/usr/bin/node", "-e", "require('codex')"))).toBeNull()
    expect(nodeLauncherName(cmdline("/usr/bin/node", "/tmp/codex.js"))).toBeNull()
    expect(nodeLauncherName(cmdline("/usr/bin/python", "/tmp/codex"))).toBeNull()
  })
})
