import { useMemo, type Dispatch, type SetStateAction } from "react"

import { orderedTerminals } from "../../model/roster"
import { openRecent, visibleSwitcher, type RecentSwitcher } from "../../terminals/recent"
import { currentContext, currentState } from "../selectors"
import type { UiState } from "../ui-store"
import { useWorkspaceServices, type WorkspaceServices } from "./context"
import { useStoreSelector } from "./useStoreSelector"

export type RecentSwitcherOptions = {
  context: string
  dialog: string | null
}

export type RecentSwitcherController = {
  readonly recentSwitcher: RecentSwitcher | null
  readonly visibleRecentSwitcher: RecentSwitcher | null
  readonly setRecentSwitcher: Dispatch<SetStateAction<RecentSwitcher | null>>
  readonly closeRecentSwitcher: () => void
  readonly openRecentSwitcher: (id: string, trigger: HTMLButtonElement) => void
  readonly recentIds: () => readonly string[]
}

const selectSwitcher = (state: UiState): RecentSwitcher | null => state.recent.switcher

// Switcher operations read the latest stores when called, so they stay stable.
const createRecentOperations = ({ ui, workspace }: Pick<WorkspaceServices, "ui" | "workspace">) => {
  // The button that opened the click-mode switcher, which gets focus back on close.
  let trigger: HTMLButtonElement | null = null
  const setRecentSwitcher: Dispatch<SetStateAction<RecentSwitcher | null>> = (value) =>
    void ui.update((state) => {
      const switcher = typeof value === "function" ? value(state.recent.switcher) : value
      return switcher === state.recent.switcher
        ? state
        : { ...state, recent: { ...state.recent, switcher } }
    })
  const recentIds = (): readonly string[] =>
    ui.getSnapshot().recent.byContext[currentContext(workspace.getSnapshot())] ?? []
  return {
    setRecentSwitcher,
    recentIds,
    closeRecentSwitcher: (): void => {
      const { recent, location } = ui.getSnapshot()
      const visible = visibleSwitcher(
        recent.switcher,
        currentContext(workspace.getSnapshot()),
        location.route.dialog,
      )
      const focus = visible?.mode === "click" ? trigger : null
      setRecentSwitcher(null)
      queueMicrotask(() => focus?.isConnected && focus.focus({ preventScroll: true }))
    },
    openRecentSwitcher: (id: string, button: HTMLButtonElement): void => {
      const snapshot = workspace.getSnapshot()
      const context = currentContext(snapshot)
      const ids =
        ui.getSnapshot().recent.byContext[context] ??
        orderedTerminals(currentState(snapshot).roster).map((terminal) => terminal.id)
      trigger = button
      setRecentSwitcher(openRecent(context, ids, id))
    },
  }
}

export const useRecentSwitcher = ({
  context,
  dialog,
}: RecentSwitcherOptions): RecentSwitcherController => {
  const { ui, workspace } = useWorkspaceServices()
  const recentSwitcher = useStoreSelector(ui, selectSwitcher)
  const operations = useMemo(() => createRecentOperations({ ui, workspace }), [ui, workspace])
  return {
    ...operations,
    recentSwitcher,
    visibleRecentSwitcher: visibleSwitcher(recentSwitcher, context, dialog),
  }
}
