import { useCallback, useLayoutEffect, useRef, useState } from "react"
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
  const requested = useRef(url)
  const history = location.state as { dialogDepth?: number } | null
  const dialogDepth = history?.dialogDepth ?? 0
  useLayoutEffect(() => {
    requested.current = url
    if (`${location.pathname}${location.search}` !== url)
      void navigate(url, { replace: true, state: location.state })
  }, [location.pathname, location.search, location.state, navigate, url])

  const visit = useCallback(
    (destination: string, replace: boolean, depth = 0): void => {
      // Canvas can report one click through both node-selection and click callbacks
      // before React renders the destination. Only commit that destination once.
      if (destination === requested.current) return
      requested.current = destination
      void navigate(destination, { replace, state: depth > 0 ? { dialogDepth: depth } : null })
    },
    [navigate],
  )

  const dispatch = useCallback((action: WorkspaceAction): void => {
    setSaved((current) => workspaceReducer(current, action))
  }, [])
  const go = useCallback(
    (changes: Partial<WorkspaceRoute>, replace = false): void => {
      const next = { ...route, ...changes }
      const depth = !next.dialog
        ? 0
        : !route.dialog
          ? 1
          : dialogDepth > 0
            ? dialogDepth + (replace ? 0 : 1)
            : 0
      const destination = routeUrl(next)
      // Ignore selection callbacks for the currently rendered location too;
      // a bubbling click must not undo a view change queued by a child control.
      if (destination !== url) visit(destination, replace, depth)
    },
    [visit, route, dialogDepth, url],
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
    visit(destination, replace)
  }
  const closeDialog = (): void => {
    const destination = routeUrl({ ...route, dialog: null, section: "general" })
    if (destination === requested.current) return
    if (Number.isSafeInteger(dialogDepth) && dialogDepth > 0) {
      requested.current = destination
      void navigate(-dialogDepth)
    } else {
      // A direct dialog link has no app-owned background entry to return to.
      visit(destination, true)
    }
  }
  return { workspace, dispatch, route, go, navigateWorkspace, closeDialog }
}
