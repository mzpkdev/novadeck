import type { TerminalMetadata } from "../model/types"

// The frame calls out an exited, killed or failed process; other states show nothing.
export const terminalStatusLabel = (terminal: TerminalMetadata): string | null => {
  if (terminal.state === "exited") {
    if (terminal.signal) return `Killed · ${terminal.signal}`
    return terminal.exitCode === null ? "Exited" : `Exited · code ${terminal.exitCode}`
  }
  if (terminal.state === "failed") return "Failed to start"
  return null
}
