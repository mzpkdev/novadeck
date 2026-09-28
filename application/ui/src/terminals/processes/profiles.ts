import { Terminal, type LucideIcon } from "lucide-react"
import type { ComponentType, ReactNode } from "react"

import type { TerminalMetadata } from "../../model/types"
import { ClaudeIcon } from "../../ui-toolkit/icons/ClaudeIcon"
import { CodexIcon } from "../../ui-toolkit/icons/CodexIcon"
import { ClaudeBody } from "./ClaudeBody"
import { CodexBody } from "./CodexBody"

// How the UI presents a program: its icon in the tab and window header, and a body
// around its terminal content inside the shared window, which names the program as
// `id`. The window itself never changes, so a program starting or ending keeps the
// header, a rename in progress, and focus. A per-process way to resume a restored
// program belongs here too.
export type ProcessProfile = {
  readonly id?: string
  readonly icon: LucideIcon
  readonly Body?: ComponentType<{ readonly children: ReactNode }>
}

const fallback: ProcessProfile = { icon: Terminal }

// Keyed by `programName`; programs not listed present as a plain terminal.
const profiles: ReadonlyMap<string, ProcessProfile> = new Map([
  ["claude", { id: "claude", icon: ClaudeIcon, Body: ClaudeBody }],
  ["codex", { id: "codex", icon: CodexIcon, Body: CodexBody }],
])

// A program presents as itself only while it holds the foreground; a shell, a fresh
// start, or an ending shows the plain terminal.
export const terminalProfile = (terminal: TerminalMetadata): ProcessProfile =>
  (terminal.state === "running" && profiles.get(terminal.process)) || fallback
