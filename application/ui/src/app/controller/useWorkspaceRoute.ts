import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useLocation, useNavigate } from "react-router"

import type { Backend, CreateBackend } from "../../backend/port"
import { workspaceFromSeed } from "../../model/seed"
import type { WorkspaceAction } from "../../model/state"
import { createWorkspaceStore, type WorkspaceTransaction } from "../../model/store"
import type { PreferencesValue, Workspace } from "../../model/types"
import { readWindowedView } from "../../shell/shell-storage"
import { resolveRoute, routeUrl, workspaceRoute, type WorkspaceRoute } from "../routing"
import { connectBackend } from "./backend-connection"

const currentTimestamp = (): number => Date.now()

// URL-driven navigation over the workspace store.
export type WorkspaceNavigation = {
  readonly dispatch: (action: WorkspaceAction) => void
  readonly go: (changes: Partial<WorkspaceRoute>, replace?: boolean) => void
  // Commits actions first, then navigates to the route they produce.
  readonly navigateWorkspace: (
    actions: WorkspaceTransaction,
    changes?: Partial<WorkspaceRoute>,
    replace?: boolean,
  ) => void
  readonly closeDialog: () => void
  readonly getWorkspace: () => Workspace
}

export type WorkspaceRouteState = {
  readonly backend: Backend
  readonly workspace: Workspace
  readonly route: WorkspaceRoute
  readonly navigation: WorkspaceNavigation
}

export const useWorkspaceRoute = (
  preferences: PreferencesValue,
  createBackend: CreateBackend,
): WorkspaceRouteState => {
  const location = useLocation()
  const navigate = useNavigate()
  const [{ backend, store }] = useState(() => {
    const created = createBackend()
    const view = preferences.enabledViews.includes("focus") ? "focus" : preferences.enabledViews[0]!
    const seeded = workspaceFromSeed(created.seed, {
      view,
      windowedView: readWindowedView(),
      now: currentTimestamp(),
    })
    const initial = resolveRoute(seeded, location, preferences, currentTimestamp()).workspace
    const workspaceStore = createWorkspaceStore(initial, created.commit)
    // The store only reports later commits; give the backend the starting terminals now.
    created.commit(initial, [])
    return { backend: created, store: workspaceStore }
  })
  useEffect(() => connectBackend(backend, store), [backend, store])
  const saved = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { workspace, route } = resolveRoute(saved, location, preferences, currentTimestamp())
  const input = `${location.key}:${location.pathname}${location.search}:${preferences.enabledViews.join(",")}`
  const committed = useRef(input)
  useLayoutEffect(() => {
    if (committed.current === input) return
    committed.current = input
    // Reconcile actual URL/preference changes against the latest snapshot. A pending
    // navigation must not reapply the previous URL over a newer command transaction.
    store.transact(
      (current) => resolveRoute(current, location, preferences, currentTimestamp()).actions,
    )
  }, [input, location, preferences, store])
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

  const dispatch = useCallback(
    (action: WorkspaceAction): void => {
      store.dispatch(action)
    },
    [store],
  )
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
    actions: WorkspaceTransaction,
    changes: Partial<WorkspaceRoute> = {},
    replace = false,
  ): void => {
    const next = store.transact(actions)
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
  return {
    backend,
    workspace,
    route,
    navigation: { dispatch, go, navigateWorkspace, closeDialog, getWorkspace: store.getSnapshot },
  }
}
