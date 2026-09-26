import { sessionName } from "../../model/session-name"
import { createSessionState, createWorkspaceSession } from "../../model/state"
import type { ViewMode, WindowedView, WorkspaceSession } from "../../model/types"

// A fresh, empty workspace session named after the minute it started.
export const newWorkspaceSession = (
  view: ViewMode,
  windowedView: WindowedView,
): WorkspaceSession => {
  const now = Date.now()
  return createWorkspaceSession(
    { name: sessionName(now), state: createSessionState([], view, windowedView) },
    { id: crypto.randomUUID(), now },
  )
}
