import { useMemo } from "react"

import type { Backend } from "../../backend/port"
import { orderedTerminals } from "../../model/roster"
import { activeProject, activeSession, type WorkspaceAction } from "../../model/state"
import type {
  PreferencesValue,
  TerminalMetadata,
  Workspace,
  WorkspaceProject,
  WorkspaceSession,
  WorkspaceTarget,
} from "../../model/types"
import { useWorkspaceShell, type ShellController } from "../../shell/useWorkspaceShell"
import { useRecentSwitcher, type RecentSwitcherController } from "../../terminals/useRecentSwitcher"
import { useTerminalRename, type TerminalRenameController } from "../../terminals/useTerminalRename"
import type { WorkspaceRoute } from "../routing"
import type { UiLocation, UiState } from "../ui-store"
import { useWorkspaceServices } from "./context"
import type { WorkspaceNavigator } from "./navigator"
import { useStoreSelector } from "./useStoreSelector"
import { useWorkspaceCommands, type WorkspaceCommands } from "./useWorkspaceCommands"

// Navigation plus direct workspace commits for commands and sections.
export type WorkspaceNavigation = WorkspaceNavigator & {
  readonly dispatch: (action: WorkspaceAction) => void
  readonly getWorkspace: () => Workspace
}

// Everything the workspace page renders from, composed once per render.
export type WorkspaceController = {
  readonly backend: Backend
  readonly workspace: Workspace
  readonly project: WorkspaceProject
  readonly session: WorkspaceSession
  readonly target: WorkspaceTarget
  // `${projectId}/${workspaceSessionId}`; presentation state is scoped to it.
  readonly context: string
  readonly route: WorkspaceRoute
  readonly navigation: WorkspaceNavigation
  readonly preferences: PreferencesValue
  readonly shell: ShellController
  readonly rename: TerminalRenameController
  readonly recent: RecentSwitcherController
  readonly commands: WorkspaceCommands
  // The terminal Focus shows: the selection, a kept preview, or the first terminal.
  readonly active: TerminalMetadata | undefined
}

const selectPreferences = (state: UiState): PreferencesValue => state.preferences
const selectLocation = (state: UiState): UiLocation => state.location
const whole = (workspace: Workspace): Workspace => workspace

const useWorkspaceTarget = (projectId: string, workspaceSessionId: string): WorkspaceTarget =>
  useMemo(() => ({ projectId, workspaceSessionId }), [projectId, workspaceSessionId])

export const useWorkspaceController = (): WorkspaceController => {
  const services = useWorkspaceServices()
  const { backend, ui } = services
  const workspace = useStoreSelector(services.workspace, whole)
  const { route, navigationType } = useStoreSelector(ui, selectLocation)
  const preferences = useStoreSelector(ui, selectPreferences)
  const setPreferences = (next: PreferencesValue): void =>
    void ui.update((state) => ({ ...state, preferences: next }))
  const navigation = useMemo<WorkspaceNavigation>(
    () => ({
      ...services.navigation,
      dispatch: (action) => void services.workspace.dispatch(action),
      getWorkspace: services.workspace.getSnapshot,
    }),
    [services],
  )
  const { go, dispatch } = navigation
  const project = activeProject(workspace)!
  const session = activeSession(workspace)!
  const projectId = project.id
  const workspaceSessionId = session.id
  const context = `${projectId}/${workspaceSessionId}`
  const { view, windowedView, selected } = session.state
  const { terminals } = session.state.roster
  const ordered = orderedTerminals(session.state.roster)
  const target = useWorkspaceTarget(projectId, workspaceSessionId)
  const shell = useWorkspaceShell({
    context,
    workspaceSessionId,
    view,
    selected,
    windowedView,
    sidebarPanel: route.panel,
    setSidebarPanel: (panel) => go({ panel }),
    navigationType,
  })
  const rename = useTerminalRename({ context, view, target, terminals, selected, dispatch })
  const recent = useRecentSwitcher({ context, dialog: route.dialog, terminals, ordered, selected })
  const commands = useWorkspaceCommands({
    workspace,
    navigation,
    newTerminal: backend.newTerminal,
    preferences,
    setPreferences,
    target,
    shell,
    rename,
    recent,
  })
  const { focusPreview } = shell
  const displayed = selected || (focusPreview?.context === context ? focusPreview.id : "")
  const active = terminals.find((terminal) => terminal.id === displayed) ?? terminals[0]
  return {
    backend,
    workspace,
    project,
    session,
    target,
    context,
    route,
    navigation,
    preferences,
    shell,
    rename,
    recent,
    commands,
    active,
  }
}
