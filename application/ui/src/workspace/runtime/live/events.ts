import type { TerminalEvent } from "@novadeck/protocol"

export type TerminalScreen = {
  reset(): void
  resize(cols: number, rows: number): void
  write(data: string, callback: () => void): void
}

/** Resolve only after xterm has parsed output, so ACK never runs ahead of the screen. */
export const applyTerminalEvent = async (
  screen: TerminalScreen,
  event: TerminalEvent,
): Promise<void> => {
  if (event.type === "snapshot") screen.reset()
  if (event.type === "snapshot" || event.type === "resized") screen.resize(event.cols, event.rows)
  if (event.type === "snapshot" || event.type === "output") {
    await new Promise<void>((resolve) => screen.write(event.data, resolve))
  }
}
