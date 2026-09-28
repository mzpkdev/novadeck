import { describe, expect, it } from "../test"
import { terminalFixture } from "../test/fixtures"
import { processKind, rememberProcess } from "./process"
import { createRoster, setTerminalProcess, setTerminalStatus } from "./roster"

// Remembering a program does not claim that it is still running.
describe("remembered processes", () => {
  it("keeps an agent through a fresh shell, unknown reports, and status changes", () => {
    let roster = createRoster([{ ...terminalFixture(1, "~/project"), lastKnownProcess: "claude" }])
    roster = setTerminalProcess(roster, "01", { process: "bash", kind: "shell" })
    roster = setTerminalStatus(roster, "01", { state: "idle" })
    expect(roster.terminals[0]).toMatchObject({
      process: "bash",
      kind: "shell",
      lastKnownProcess: "claude",
      state: "idle",
    })
    roster = setTerminalProcess(roster, "01", { process: "", kind: "shell" })
    expect(roster.terminals[0]!.lastKnownProcess).toBe("claude")
    roster = setTerminalProcess(roster, "01", { process: "vim", kind: "shell" })
    expect(roster.terminals[0]!.lastKnownProcess).toBe("vim")
    expect(processKind(roster.terminals[0]!.lastKnownProcess!)).toBe("shell")
  })

  it("remembers shells when no program is known and derives agent kinds from names", () => {
    expect(rememberProcess(undefined, "bash")).toBe("bash")
    expect(rememberProcess(undefined, "")).toBeUndefined()
    expect(rememberProcess("claude", "/bin/zsh")).toBe("claude")
    expect(processKind("/opt/bin/Codex")).toBe("codex")
    expect(processKind("claude")).toBe("claude")
    expect(processKind("unmapped-program")).toBe("shell")
  })
})
