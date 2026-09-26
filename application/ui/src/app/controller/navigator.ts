import type { NavigateFunction } from "react-router"

import type { WorkspaceStore, WorkspaceTransaction } from "../../model/store"
import { resolveRoute, routeUrl, workspaceRoute, type WorkspaceRoute } from "../routing"
import type { UiLocation, UiStore } from "../ui-store"

// URL-driven navigation over the workspace and UI stores. Each call commits the
// destination's workspace actions and route before it navigates, so a command's
// store changes and its URL change render together.
export type WorkspaceNavigator = {
  readonly go: (changes: Partial<WorkspaceRoute>, replace?: boolean) => void
  // Commits actions first, then navigates to the route they produce.
  readonly navigateWorkspace: (
    actions: WorkspaceTransaction,
    changes?: Partial<WorkspaceRoute>,
    replace?: boolean,
  ) => void
  // Returns through history to the dialog's background entry when there is one.
  readonly closeDialog: () => void
  readonly href: (changes: Partial<WorkspaceRoute>) => string
}

export type NavigatorServices = {
  readonly workspace: WorkspaceStore
  readonly ui: UiStore
  readonly now: () => number
}

// What the route-sync layer needs besides the public navigator.
export type RouterBinding = {
  // Hands the navigator the router's navigate function.
  readonly bind: (navigate: NavigateFunction) => void
  // Records the URL the router settled on, so a repeated request for it is ignored.
  readonly settle: (url: string) => void
}

const sameLocation = (a: UiLocation, b: UiLocation): boolean =>
  a.dialogDepth === b.dialogDepth &&
  a.navigationType === b.navigationType &&
  routeUrl(a.route) === routeUrl(b.route)

const writeLocation = (ui: UiStore, next: UiLocation): void =>
  void ui.update((state) =>
    sameLocation(state.location, next) ? state : { ...state, location: next },
  )

const parse = (url: string): { pathname: string; search: string } => {
  const query = url.indexOf("?")
  return query < 0
    ? { pathname: url, search: "" }
    : { pathname: url.slice(0, query), search: url.slice(query) }
}

export const createNavigator = ({
  workspace,
  ui,
  now,
}: NavigatorServices): WorkspaceNavigator & RouterBinding => {
  let navigate: NavigateFunction | undefined
  let requested = routeUrl(ui.getSnapshot().location.route)
  const current = () => ui.getSnapshot().location

  const visit = (destination: string, replace: boolean, depth = 0): void => {
    // Canvas can report one click through both node-selection and click callbacks
    // before React renders the destination. Only commit that destination once.
    if (destination === requested) return
    const resolved = resolveRoute(
      workspace.getSnapshot(),
      parse(destination),
      ui.getSnapshot().preferences,
      now(),
    )
    workspace.transact(resolved.actions)
    const url = routeUrl(resolved.route)
    requested = url
    writeLocation(ui, {
      route: resolved.route,
      dialogDepth: depth,
      navigationType: replace ? "REPLACE" : "PUSH",
    })
    void navigate?.(url, { replace, state: depth > 0 ? { dialogDepth: depth } : null })
  }

  const go = (changes: Partial<WorkspaceRoute>, replace = false): void => {
    const { route, dialogDepth } = current()
    const next = { ...route, ...changes }
    const depth = !next.dialog
      ? 0
      : !route.dialog
        ? 1
        : dialogDepth > 0
          ? dialogDepth + (replace ? 0 : 1)
          : 0
    const destination = routeUrl(next)
    // Ignore selection callbacks for the current location too; a bubbling click
    // must not undo a view change queued by a child control.
    if (destination !== routeUrl(route)) visit(destination, replace, depth)
  }

  const navigateWorkspace = (
    actions: WorkspaceTransaction,
    changes: Partial<WorkspaceRoute> = {},
    replace = false,
  ): void => {
    const next = workspace.transact(actions)
    const { route } = current()
    visit(routeUrl({ ...route, ...workspaceRoute(next), panel: route.panel, ...changes }), replace)
  }

  const closeDialog = (): void => {
    const { route, dialogDepth } = current()
    const destination = routeUrl({ ...route, dialog: null, section: "general" })
    if (destination === requested) return
    if (Number.isSafeInteger(dialogDepth) && dialogDepth > 0) {
      requested = destination
      void navigate?.(-dialogDepth)
    } else {
      // A direct dialog link has no app-owned background entry to return to.
      visit(destination, true)
    }
  }

  return {
    go,
    navigateWorkspace,
    closeDialog,
    href: (changes) => routeUrl({ ...current().route, ...changes }),
    bind: (next) => {
      navigate = next
    },
    settle: (url) => {
      requested = url
    },
  }
}

// Reconciles a location the navigator did not produce, such as Back/Forward, a
// typed URL, or a preference change, against the latest workspace.
export const syncLocation = (
  { workspace, ui, now }: NavigatorServices,
  input: {
    readonly location: { readonly pathname: string; readonly search: string }
    readonly navigationType: UiLocation["navigationType"]
    readonly dialogDepth: number
  },
): void => {
  const resolved = resolveRoute(
    workspace.getSnapshot(),
    input.location,
    ui.getSnapshot().preferences,
    now(),
  )
  workspace.transact(resolved.actions)
  writeLocation(ui, {
    route: resolved.route,
    dialogDepth: input.dialogDepth,
    navigationType: input.navigationType,
  })
}
