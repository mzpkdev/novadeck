import { initialGridLayouts } from "../workspace/layouts/grid/placement"
import { demoCanvasLayout, initialProjects, projectSessions } from "../workspace/mock/sessions"
import {
  createWorkspace,
  createWorkspaceSession,
  createSessionState,
  workspaceReducer,
} from "../workspace/model/state"
import type {
  TerminalMetadata,
  PreferencesValue,
  ViewMode,
  WindowedView,
  WorkspaceSession,
} from "../workspace/model/types"
import { readWindowedView } from "../workspace/shell/shell-storage"

export const newWorkspaceSession = (
  terminals: TerminalMetadata[],
  view: ViewMode,
  windowedView: WindowedView,
  layout?: Parameters<typeof createSessionState>[3],
): WorkspaceSession => {
  const now = Date.now()
  return createWorkspaceSession(
    {
      name: new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now),
      state: createSessionState(terminals, view, windowedView, layout),
    },
    { id: crypto.randomUUID(), now },
  )
}

export const initializeWorkspace = (preferences: PreferencesValue) => {
  const view = preferences.enabledViews.includes("focus") ? "focus" : preferences.enabledViews[0]!
  return initialProjects.reduce(
    (workspace, project) => {
      const terminals = projectSessions(project)
      const canvasLayout = demoCanvasLayout()
      const session = newWorkspaceSession(terminals, view, readWindowedView(), {
        canvasLayout,
        gridLayouts: initialGridLayouts(terminals, canvasLayout.geometry),
      })
      return workspaceReducer(workspace, {
        type: "session/add",
        projectId: project.id,
        session: { ...session, id: "initial" },
      })
    },
    createWorkspace({ projects: initialProjects, activeProjectId: initialProjects[0]!.id }),
  )
}
