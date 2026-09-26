import { activeProject, activeSession } from "../model/state"
import type { Workspace, WorkspaceState } from "../model/types"

// The active session's state; the workspace always has one once seeded.
export const currentState = (workspace: Workspace): WorkspaceState =>
  activeSession(workspace)!.state

// `${projectId}/${workspaceSessionId}`; presentation state is scoped to it.
export const currentContext = (workspace: Workspace): string =>
  `${workspace.activeProjectId}/${activeProject(workspace)!.activeSessionId}`

// What a person sees change on Back/Forward: the session, its view and its selection.
export const currentPresentation = (workspace: Workspace): string => {
  const { view, selected } = currentState(workspace)
  return `${currentContext(workspace)}/${view}/${selected}`
}
