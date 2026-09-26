import type { TerminalMetadata, TerminalRoster } from "./types"

export const createRoster = (terminals: TerminalMetadata[]): TerminalRoster => ({
  terminals,
  order: [],
  nextNumber: terminals.length + 1,
})

export const hasTerminal = (roster: TerminalRoster, terminalId: string): boolean =>
  roster.terminals.some((terminal) => terminal.id === terminalId)

// Terminals in sidebar order; terminals missing from the saved order follow in creation order.
export const orderedTerminals = (roster: TerminalRoster): TerminalMetadata[] => {
  const byId = new Map(roster.terminals.map((terminal) => [terminal.id, terminal]))
  const ordered = roster.order.flatMap((id) => {
    const terminal = byId.get(id)
    return terminal ? [terminal] : []
  })
  const orderedIds = new Set(ordered.map((terminal) => terminal.id))
  return [...ordered, ...roster.terminals.filter((terminal) => !orderedIds.has(terminal.id))]
}

export const addTerminal = (
  roster: TerminalRoster,
  terminal: TerminalMetadata,
): TerminalRoster => ({
  ...roster,
  terminals: [...roster.terminals, terminal],
  nextNumber: roster.nextNumber + 1,
})

export const renameTerminal = (
  roster: TerminalRoster,
  terminalId: string,
  name: string,
): TerminalRoster =>
  hasTerminal(roster, terminalId)
    ? {
        ...roster,
        terminals: roster.terminals.map((terminal) =>
          terminal.id === terminalId ? { ...terminal, name } : terminal,
        ),
      }
    : roster

export const removeTerminal = (roster: TerminalRoster, terminalId: string): TerminalRoster =>
  hasTerminal(roster, terminalId)
    ? {
        ...roster,
        terminals: roster.terminals.filter((terminal) => terminal.id !== terminalId),
        order: roster.order.filter((id) => id !== terminalId),
      }
    : roster

// Keeps known ids once each, in the requested order.
export const reorderTerminals = (roster: TerminalRoster, requested: string[]): TerminalRoster => {
  const seen = new Set<string>()
  const order = requested.filter(
    (id) => hasTerminal(roster, id) && !seen.has(id) && (seen.add(id), true),
  )
  return order.length === roster.order.length &&
    order.every((id, index) => roster.order[index] === id)
    ? roster
    : { ...roster, order }
}
