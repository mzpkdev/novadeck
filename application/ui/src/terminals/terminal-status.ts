import type { TerminalMetadata } from "../model/types"

// The frame calls out an exited, failed or ended process; other states show nothing.
export const terminalStatusLabel = (terminal: TerminalMetadata): string | null => {
  if (terminal.state === "exited")
    return terminal.exitCode === null ? "Exited" : `Exited · code ${terminal.exitCode}`
  if (terminal.state === "failed") return "Failed to start"
  if (terminal.state === "ended") return "Ended"
  return null
}
