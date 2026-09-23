import { matchPath } from "react-router"

import { activeProject, activeSession, workspaceReducer } from "../workspace/model/state"
import type { PreferencesValue, ViewMode, Workspace } from "../workspace/model/types"

export type WorkspaceRoute = {
  projectId: string
  sessionId: string
  view: ViewMode
  terminal: string
  panel: "terminals" | "sessions"
  dialog: "search" | "preferences" | null
  section: "general" | "shortcuts"
}

export const workspaceRoute = (workspace: Workspace): WorkspaceRoute => ({
  projectId: workspace.activeProjectId,
  sessionId: activeProject(workspace)!.activeSessionId,
  view: activeSession(workspace)!.state.view,
  terminal: activeSession(workspace)!.state.selected,
  panel: "terminals",
  dialog: null,
  section: "general",
})

export const routeUrl = (route: WorkspaceRoute): string => {
  const search = new URLSearchParams()
  // Keep an explicit empty selection so Canvas can have no active terminal.
  search.set("terminal", route.terminal)
  if (route.panel === "sessions") search.set("panel", route.panel)
  if (route.dialog) search.set("dialog", route.dialog)
  if (route.dialog === "preferences" && route.section === "shortcuts")
    search.set("section", route.section)
  return `/projects/${encodeURIComponent(route.projectId)}/sessions/${encodeURIComponent(route.sessionId)}/${route.view}?${search}`
}

export const resolveRoute = (
  workspace: Workspace,
  location: { pathname: string; search: string },
  preferences: PreferencesValue,
  now: number,
): { workspace: Workspace; route: WorkspaceRoute } => {
  const match = matchPath("/projects/:projectId/sessions/:sessionId/:view", location.pathname)
  const params = match?.params
  const project =
    workspace.projects.find((item) => item.id === params?.projectId) ?? activeProject(workspace)!
  const session =
    project.history.find((item) => item.id === params?.sessionId) ??
    project.history.find((item) => item.id === project.activeSessionId)!
  let next = workspace
  if (next.activeProjectId !== project.id)
    next = workspaceReducer(next, { type: "project/select", projectId: project.id, now })
  if (project.activeSessionId !== session.id)
    next = workspaceReducer(next, {
      type: "session/select",
      projectId: project.id,
      workspaceSessionId: session.id,
      now,
    })
  const view =
    preferences.enabledViews.find((item) => item === params?.view) ??
    (preferences.enabledViews.includes(session.state.view)
      ? session.state.view
      : preferences.enabledViews[0]!)
  const search = new URLSearchParams(location.search)
  const requestedTerminal = search.get("terminal")
  const terminal =
    requestedTerminal === "" || session.state.sessions.some((item) => item.id === requestedTerminal)
      ? requestedTerminal!
      : session.state.selected
  const target = { projectId: project.id, workspaceSessionId: session.id }
  if (session.state.view !== view)
    next = workspaceReducer(next, {
      type: "view/change",
      target,
      view,
      enabledViews: preferences.enabledViews,
    })
  if (session.state.selected !== terminal)
    next = workspaceReducer(next, { type: "terminal/select", target, terminalId: terminal })
  const dialog = search.get("dialog")
  return {
    workspace: next,
    route: {
      projectId: project.id,
      sessionId: session.id,
      view,
      terminal,
      panel: search.get("panel") === "sessions" ? "sessions" : "terminals",
      dialog: dialog === "search" || dialog === "preferences" ? dialog : null,
      section:
        dialog === "preferences" && search.get("section") === "shortcuts" ? "shortcuts" : "general",
    },
  }
}
