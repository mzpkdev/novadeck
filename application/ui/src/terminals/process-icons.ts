import { Terminal, type LucideIcon } from "lucide-react"
import { createElement, type ReactElement } from "react"

import { ClaudeIcon } from "../ui-toolkit/icons/ClaudeIcon"
import { CodexIcon } from "../ui-toolkit/icons/CodexIcon"

const processIcons = new Map<string, LucideIcon>([
  ["claude", ClaudeIcon],
  ["codex", CodexIcon],
])

export const processIcon = (name: string): ReactElement =>
  createElement(processIcons.get(name.toLowerCase()) ?? Terminal, { size: 14, strokeWidth: 1.5 })
