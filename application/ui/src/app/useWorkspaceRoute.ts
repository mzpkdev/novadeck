import { useCallback, useLayoutEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router"

import { workspaceReducer, type WorkspaceAction } from "../workspace/model/state"
import type { PreferencesValue, Workspace } from "../workspace/model/types"
import { resolveRoute, routeUrl, workspaceRoute, type WorkspaceRoute } from "./routing"

const currentTimestamp = (): number => Date.now()

export const useWorkspaceRoute = (
  preferences: PreferencesValue,
  initialize: (preferences: PreferencesValue) => Workspace,
) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(() => initialize(preferences))
  const { workspace, route } = resolveRoute(saved, location, preferences, currentTimestamp())
  // The URL owns navigation. Keep the reducer's last-visited selections as history
  // for switching projects/sessions, without rendering a stale destination first.
  if (workspace !== saved) setSaved(workspace)
  const url = routeUrl(route)
  useLayoutEffect(() => {
    if (`${location.pathname}${location.search}` !== url) void navigate(url, { replace: true })
  }, [location.pathname, location.search, navigate, url])

  const dispatch = useCallback((action: WorkspaceAction): void => {
    setSaved((current) => workspaceReducer(current, action))
  }, [])
  const go = useCallback(
    (changes: Partial<WorkspaceRoute>, replace = false): void => {
      const destination = routeUrl({ ...route, ...changes })
      if (destination !== url) void navigate(destination, { replace })
    },
    [navigate, route, url],
  )
  const navigateWorkspace = (
    actions: WorkspaceAction[],
    changes: Partial<WorkspaceRoute> = {},
    replace = false,
  ): void => {
    const next = actions.reduce(workspaceReducer, workspace)
    setSaved(next)
    const destination = routeUrl({
      ...route,
      ...workspaceRoute(next),
      panel: route.panel,
      ...changes,
    })
    if (destination !== url) void navigate(destination, { replace })
  }
  return { workspace, dispatch, route, go, navigateWorkspace }
}
