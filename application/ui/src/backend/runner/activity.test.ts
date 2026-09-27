import type { TerminalSummary } from "@novadeck/protocol"

import { context, describe, expect, it } from "../../test"
import { programName, terminalActivity } from "./activity"

const summary = (change: Partial<TerminalSummary>): TerminalSummary => ({
  id: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  cwd: "/home/alex",
  cols: 80,
  rows: 24,
  status: "running",
  exitCode: null,
  process: "zsh",
  ...change,
})

describe("terminal activity", () => {
  context("while a shell waits in the foreground", () => {
    it("is idle and shows a shell", () => {
      expect(terminalActivity(summary({ process: "zsh" }))).toEqual({
        status: { state: "idle" },
        process: { process: "zsh", kind: "shell" },
      })
    })

    it("recognises login shells, paths and Windows executables", () => {
      const states = ["-bash", "/usr/bin/fish", "pwsh.exe", "C:\\Windows\\cmd.exe", "nu"].map(
        (process) => terminalActivity(summary({ process })).status.state,
      )
      expect(states).toEqual(["idle", "idle", "idle", "idle", "idle"])
    })
  })

  context("while another program runs", () => {
    it("is running and picks the icon for agents and git", () => {
      const kinds = ["claude", "codex", "git", "vim"].map(
        (process) => terminalActivity(summary({ process })).process?.kind,
      )
      expect(kinds).toEqual(["claude", "codex", "git", "shell"])
      expect(terminalActivity(summary({ process: "vim" })).status).toEqual({ state: "running" })
    })

    it("keeps the program's own name for the terminal", () => {
      expect(terminalActivity(summary({ process: "/opt/bin/Claude" })).process).toEqual({
        process: "/opt/bin/Claude",
        kind: "claude",
      })
    })
  })

  context("when the platform cannot tell what runs", () => {
    it("shows an idle shell", () => {
      expect(terminalActivity(summary({ process: null }))).toEqual({
        status: { state: "idle" },
        process: { process: "", kind: "shell" },
      })
    })
  })

  context("once the process exited", () => {
    it("reports the exit code and leaves the process as it was", () => {
      expect(terminalActivity(summary({ status: "exited", exitCode: 130, process: null }))).toEqual(
        { status: { state: "exited", exitCode: 130 } },
      )
    })
  })
})

describe("program name", () => {
  it("drops the directory, login dash and .exe suffix", () => {
    expect(["/bin/zsh", "-zsh", "PWSH.EXE", "git"].map(programName)).toEqual([
      "zsh",
      "zsh",
      "pwsh",
      "git",
    ])
  })
})
