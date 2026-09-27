import type { TerminalSummary } from "@novadeck/protocol"

import type { TerminalProcess } from "../../model/roster"
import type { TerminalKind, TerminalStatus } from "../../model/types"

// Programs that wait for commands rather than doing work of their own.
const shells = new Set([
  "bash",
  "zsh",
  "fish",
  "sh",
  "dash",
  "ksh",
  "mksh",
  "tcsh",
  "csh",
  "ash",
  "pwsh",
  "powershell",
  "cmd",
  "nu",
  "elvish",
  "xonsh",
])
const kinds: Readonly<Record<string, TerminalKind>> = {
  claude: "claude",
  codex: "codex",
  git: "git",
}

// "/usr/bin/zsh", "-zsh" (a login shell) and "pwsh.exe" all name the program "zsh" or "pwsh".
export const programName = (process: string): string =>
  (process.split(/[\\/]/).at(-1) ?? process)
    .replace(/^-/, "")
    .replace(/\.exe$/i, "")
    .toLowerCase()

export type TerminalActivity = {
  readonly status: TerminalStatus
  // Absent once the process exited: the last foreground program stays on show.
  readonly process?: TerminalProcess
}

// What the UI shows for a terminal the runner reports: its icon, and whether it is
// busy (a program runs in the foreground) or idle (the shell waits for input).
export const terminalActivity = (summary: TerminalSummary): TerminalActivity => {
  if (summary.status === "exited")
    return { status: { state: "exited", exitCode: summary.exitCode } }
  const process = summary.process ?? ""
  const program = programName(process)
  return {
    status: { state: !program || shells.has(program) ? "idle" : "running" },
    process: { process, kind: kinds[program] ?? "shell" },
  }
}
