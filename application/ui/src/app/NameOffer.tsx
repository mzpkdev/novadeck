import { useEffect } from "react"

import { useWorkspaceServices } from "./controller/context"
import { canCarryChip, offerable, offerDue, watchAgentFinishes } from "./murmur-offer"
import { currentContext, currentState } from "./selectors"

// Murmur's one-time offer, as it is raised: when an agent finishes a turn in a run of the app,
// Murmur could be on (and has not been offered in three sessions), and the terminal is on
// screen under its plain name, the chip goes on that terminal (NameChip.tsx). The count of
// sessions is the runner's, and the run's own mark keeps voice input's offer and this one from
// both coming up; both are set when the chip is drawn. Nothing is drawn here.
export const NameOffer = (): null => {
  const { backend, workspace, ui, commands } = useWorkspaceServices()
  const { murmur } = backend
  useEffect(() => {
    if (!murmur) return undefined
    return watchAgentFinishes(workspace, (terminal) => {
      if (ui.getSnapshot().addonOfferShown || !offerDue(murmur.state.getSnapshot())) return
      // Counted and marked once the chip has drawn (NameChip.tsx), not before: a finish
      // that cannot carry it, off screen or under a title someone gave, is let go.
      if (canCarryChip(workspace.getSnapshot(), terminal)) commands.offerNameTo(terminal)
    })
  }, [murmur, workspace, ui, commands])
  // A backend that asks to offer now (the demo's debug panel) puts the chip on the selected
  // terminal, whatever came before.
  useEffect(() => {
    const requests = murmur?.offer
    if (!murmur || !requests) return undefined
    let seen = requests.getSnapshot()
    return requests.subscribe(() => {
      const count = requests.getSnapshot()
      if (count === seen) return
      seen = count
      const snapshot = workspace.getSnapshot()
      const { selected } = currentState(snapshot)
      if (!selected || !offerable(murmur.state.getSnapshot())) return
      commands.offerNameTo({ context: currentContext(snapshot), id: selected })
    })
  }, [murmur, workspace, commands])
  return null
}
