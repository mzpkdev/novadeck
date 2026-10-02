import type { TerminalMetadata } from "../model/types"
import { mailTab, show } from "../terminals/companion/pane"
import { companionActions, openTab } from "../terminals/companion/state"
import type { DockTarget } from "../terminals/window-menu"
import { useWorkspaceServices, useWorkspaceState } from "./controller/context"
import { currentState, currentTarget, sameTarget } from "./selectors"

// For a window undocked from a terminal's companion: docking it back in that terminal,
// which closes the window, opens what it showed in that terminal's pane and selects the
// terminal. (Closing the window docks it too, without opening it.) Undefined for any other window; its parts are absent once that terminal has
// closed.
export const useCompanionDock = (terminal: TerminalMetadata): DockTarget | undefined => {
  const { backend, commands } = useWorkspaceServices()
  const target = useWorkspaceState(currentTarget, sameTarget)
  const from = terminal.companion?.from
  const name = useWorkspaceState((workspace) =>
    from === undefined
      ? undefined
      : currentState(workspace).roster.terminals.find((each) => each.id === from)?.name,
  )
  const undocked = terminal.companion
  if (!undocked) return undefined
  const { companions } = backend
  const { item } = undocked
  return {
    name,
    onDock:
      name === undefined || !companions
        ? undefined
        : () => {
            companionActions(companions, { ...target, terminalId: undocked.from }).update((pane) =>
              item.kind === "messages" ? openTab(pane, mailTab) : show(pane, item.ref, true),
            )
            commands.close(terminal.id)
            commands.select(undocked.from)
          },
  }
}
