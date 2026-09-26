import { useMemo } from "react"
import { useNavigationType } from "react-router"

import type { Backend, CreateBackend } from "../../backend/port"
import { orderedTerminals } from "../../model/roster"
import { activeProject, activeSession } from "../../model/state"
import type {
  PreferencesValue,
  TerminalMetadata,
  Workspace,
  WorkspaceProject,
  WorkspaceSession,
  WorkspaceTarget,
} from "../../model/types"
import { useWorkspacePreferences } from "../../preferences/useWorkspacePreferences"
import { useWorkspaceShell, type ShellController } from "../../shell/useWorkspaceShell"
import { useRecentSwitcher, type RecentSwitcherController } from "../../terminals/useRecentSwitcher"
import { useTerminalRename, type TerminalRenameController } from "../../terminals/useTerminalRename"
import type { WorkspaceRoute } from "../routing"
import { useWorkspaceCommands, type WorkspaceCommands } from "./useWorkspaceCommands"
import { useWorkspaceRoute, type WorkspaceNavigation } from "./useWorkspaceRoute"

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

const useWorkspaceTarget = (projectId: string, workspaceSessionId: string): WorkspaceTarget =>
  useMemo(() => ({ projectId, workspaceSessionId }), [projectId, workspaceSessionId])

export const useWorkspaceController = (createBackend: CreateBackend): WorkspaceController => {
  const navigationType = useNavigationType()
  const { preferences, setPreferences } = useWorkspacePreferences()
  const { backend, workspace, route, navigation } = useWorkspaceRoute(preferences, createBackend)
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
