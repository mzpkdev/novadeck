import { createStore } from "zustand/vanilla"

import { workspaceReducer, type WorkspaceAction } from "./state"
import type { Workspace, WorkspaceState } from "./types"

export type WorkspaceTransaction =
  | readonly WorkspaceAction[]
  | ((workspace: Workspace) => readonly WorkspaceAction[])

type SessionPresentation = Omit<WorkspaceState, "sessions"> & {
  aliases: Record<string, string>
  dismissed: Record<string, boolean>
}
type Presentation = {
  activeProjectId: string
  projects: Record<string, { activeSessionId: string }>
  sessions: Record<string, SessionPresentation & { visitedAt: number }>
}
const key = (projectId: string, sessionId: string): string => `${projectId}/${sessionId}`

const presentationOf = (workspace: Workspace, previous?: Presentation): Presentation => ({
  activeProjectId: workspace.activeProjectId,
  projects: {
    ...previous?.projects,
    ...Object.fromEntries(
      workspace.projects.map((project) => [
        project.id,
        {
          activeSessionId: project.activeSessionId,
        },
      ]),
    ),
  },
  sessions: {
    ...previous?.sessions,
    ...Object.fromEntries(
      workspace.projects.flatMap((project) =>
        project.history.map((session) => {
          const { sessions: _sessions, ...state } = session.state
          const prior = previous?.sessions[key(project.id, session.id)]
          return [
            key(project.id, session.id),
            {
              ...state,
              visitedAt: session.visitedAt,
              aliases: prior?.aliases ?? {},
              dismissed: prior?.dismissed ?? {},
            },
          ]
        }),
      ),
    ),
  },
})

const projectWorkspace = (metadata: Workspace, presentation: Presentation): Workspace => ({
  activeProjectId: metadata.projects.some((project) => project.id === presentation.activeProjectId)
    ? presentation.activeProjectId
    : metadata.activeProjectId,
  projects: metadata.projects.map((project) => ({
    ...project,
    activeSessionId: project.history.some(
      (session) => session.id === presentation.projects[project.id]?.activeSessionId,
    )
      ? presentation.projects[project.id]!.activeSessionId
      : project.activeSessionId,
    history: project.history.map((session) => {
      const saved = presentation.sessions[key(project.id, session.id)]
      if (!saved) return session
      const { aliases, dismissed, visitedAt, ...state } = saved
      const sessions = session.state.sessions
        .filter((terminal) => !dismissed[terminal.id])
        .map((terminal) =>
          aliases[terminal.id] ? { ...terminal, name: aliases[terminal.id]! } : terminal,
        )
      return {
        ...session,
        visitedAt,
        state: {
          ...state,
          sessions,
          selected:
            !state.selected || sessions.some((terminal) => terminal.id === state.selected)
              ? state.selected
              : (sessions[0]?.id ?? ""),
        },
      }
    }),
  })),
})

export const createWorkspaceStore = (
  initial: Workspace,
  onCommit?: (workspace: Workspace, actions: readonly WorkspaceAction[]) => void,
  metadataSource?: () => Workspace,
) => {
  // In connected mode Query owns metadata. Zustand contains only client presentation.
  // The standalone mode remains useful for reducer fixtures and explicit demo seeding.
  let standalone = initial
  const store = createStore<Presentation>(() => presentationOf(initial))
  let snapshot = initial
  const transact = (transaction: WorkspaceTransaction): Workspace => {
    const actions = typeof transaction === "function" ? transaction(snapshot) : transaction
    const next = actions.reduce(workspaceReducer, snapshot)
    if (next === snapshot) return snapshot
    if (!metadataSource) standalone = next
    const presentation = presentationOf(next, store.getState())
    for (const action of actions) {
      if (action.type !== "terminal/rename" && action.type !== "terminal/close") continue
      const session =
        presentation.sessions[key(action.target.projectId, action.target.workspaceSessionId)]
      if (!session) continue
      if (action.type === "terminal/rename")
        session.aliases = { ...session.aliases, [action.terminalId]: action.name }
      else session.dismissed = { ...session.dismissed, [action.terminalId]: true }
    }
    snapshot = projectWorkspace(metadataSource?.() ?? standalone, presentation)
    onCommit?.(snapshot, actions)
    store.setState(presentation, true)
    return snapshot
  }
  return {
    presentation: store,
    getSnapshot: (): Workspace => snapshot,
    subscribe: (listener: () => void): (() => void) => store.subscribe(listener),
    dispatch: (action: WorkspaceAction): Workspace => transact([action]),
    transact,
    refreshMetadata: (): Workspace => {
      snapshot = projectWorkspace(metadataSource?.() ?? standalone, store.getState())
      const presentation = presentationOf(snapshot, store.getState())
      onCommit?.(snapshot, [])
      store.setState(presentation, true)
      return snapshot
    },
  }
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
