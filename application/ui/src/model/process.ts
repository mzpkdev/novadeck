import type { TerminalKind } from "./types"

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

export const isShellProcess = (process: string): boolean => shells.has(programName(process))

export const processKind = (process: string): TerminalKind => kinds[programName(process)] ?? "shell"

// A fresh or idle shell must not erase the program remembered across app restarts.
export const rememberProcess = (
  previous: string | undefined,
  process: string,
): string | undefined => (process && (!isShellProcess(process) || !previous) ? process : previous)
