import { Terminal, type LucideIcon } from "lucide-react"
import type { ComponentType } from "react"

import type { TerminalMetadata } from "../../model/types"
import { ClaudeIcon } from "../../ui-toolkit/icons/ClaudeIcon"
import { CodexIcon } from "../../ui-toolkit/icons/CodexIcon"
import { WindowShell, type WindowShellProps } from "../WindowShell"
import { ClaudeWindow } from "./ClaudeWindow"
import { CodexWindow } from "./CodexWindow"

// How the UI presents a program: its icon in the tab and window header, and the window
// around its terminal. A per-process way to resume a restored program belongs here too.
export type ProcessProfile = {
  readonly icon: LucideIcon
  readonly Window: ComponentType<WindowShellProps>
}

const fallback: ProcessProfile = { icon: Terminal, Window: WindowShell }

// Keyed by `programName`; programs not listed present as a plain terminal.
const profiles: ReadonlyMap<string, ProcessProfile> = new Map([
  ["claude", { icon: ClaudeIcon, Window: ClaudeWindow }],
  ["codex", { icon: CodexIcon, Window: CodexWindow }],
])

// A program presents as itself only while it holds the foreground; a shell, a fresh
// start, or an ending shows the plain terminal.
export const terminalProfile = (terminal: TerminalMetadata): ProcessProfile =>
  (terminal.state === "running" && profiles.get(terminal.process)) || fallback
