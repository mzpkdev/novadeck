import type { TerminalMetadata } from "../model/types"

// A plain shell terminal numbered like the ones a person creates.
export const terminalFixture = (number: number, directory: string): TerminalMetadata => {
  const id = String(number).padStart(2, "0")
  return {
    id,
    name: `Terminal ${id}`,
    directory,
    command: "zsh",
    process: "zsh",
    state: "idle",
    kind: "shell",
  }
}
