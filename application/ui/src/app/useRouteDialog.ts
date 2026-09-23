import { useState } from "react"

import type { WorkspaceRoute } from "./routing"

// Retain only the outgoing dialog for its exit animation. The route determines
// which dialog opens next, including when Back/Forward interrupts a transition.
export const useRouteDialog = (requested: WorkspaceRoute["dialog"], context: string) => {
  const [presentation, setPresentation] = useState({ context, dialog: requested })
  const present = presentation.dialog
  // Both dialogs remount with the workspace, so no old exit callback can advance them.
  if (presentation.context !== context || (present === null && requested !== null))
    setPresentation({ context, dialog: requested })
  return {
    searching: present === "search" && requested === "search",
    settings: present === "preferences" && requested === "preferences",
    onExitComplete: (): void => setPresentation({ context, dialog: requested }),
  }
}
