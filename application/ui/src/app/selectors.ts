import { activeProject, activeSession } from "../model/state"
import type {
  PreferencesValue,
  ViewMode,
  Workspace,
  WorkspaceState,
  WorkspaceTarget,
} from "../model/types"

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

// Where commands for the active session are addressed.
export const currentTarget = (workspace: Workspace): WorkspaceTarget => ({
  projectId: workspace.activeProjectId,
  workspaceSessionId: activeProject(workspace)!.activeSessionId,
})

// Where Focus hands a terminal back to: the session's windowed view if enabled,
// otherwise the first enabled view that is not Focus.
export const windowedDestination = (
  workspace: Workspace,
  preferences: PreferencesValue,
): ViewMode | undefined => {
  const { windowedView } = currentState(workspace)
  return preferences.enabledViews.includes(windowedView)
    ? windowedView
    : preferences.enabledViews.find((mode) => mode !== "focus")
}
