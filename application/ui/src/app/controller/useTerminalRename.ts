import { useEffect, useMemo, useRef } from "react"

import type { TerminalMetadata, ViewMode } from "../../model/types"
import {
  beginRename,
  changeDraft,
  endRename,
  renameAction,
  renameView,
  type RenameSession,
} from "../../terminals/rename-state"
import type { TerminalRename } from "../../terminals/TerminalRenameInput"
import { currentContext, currentState, currentTarget } from "../selectors"
import type { UiState, UiStore } from "../ui-store"
import { useWorkspaceServices, type WorkspaceServices } from "./context"
import { useStoreSelector } from "./useStoreSelector"

export type TerminalRenameOptions = {
  context: string
  view: ViewMode
  terminals: TerminalMetadata[]
  selected: string
}

export type TerminalRenameController = {
  readonly activeRename: RenameSession | null
  readonly renameView: TerminalRename | null
  readonly startRename: (terminal: TerminalMetadata, origin: RenameSession["origin"]) => void
  readonly changeRenameDraft: (id: string, draft: string) => void
  readonly saveRename: (id: string) => void
  readonly cancelRename: (id: string) => void
  readonly finishRename: (rename: RenameSession, save: boolean) => void
}

const selectRename = (state: UiState): RenameSession | null => state.rename

const setRename = (ui: UiStore, change: (rename: RenameSession | null) => RenameSession | null) =>
  void ui.update((state) => {
    const rename = change(state.rename)
    return rename === state.rename ? state : { ...state, rename }
  })

// Rename operations read the latest stores when called, so they stay stable.
const createRenameOperations = ({ ui, workspace }: Pick<WorkspaceServices, "ui" | "workspace">) => {
  let request = 0
  const active = (): RenameSession | null => {
    const { rename } = ui.getSnapshot()
    return rename?.context === currentContext(workspace.getSnapshot()) ? rename : null
  }
  const finishRename = (rename: RenameSession, save: boolean): void => {
    const action = renameAction(rename, save)
    if (action) workspace.dispatch(action)
    setRename(ui, (current) => endRename(current, rename))
  }
  return {
    finishRename,
    startRename: (terminal: TerminalMetadata, origin: RenameSession["origin"]): void => {
      const current = active()
      if (current?.id === terminal.id) return
      if (current) finishRename(current, true)
      const snapshot = workspace.getSnapshot()
      setRename(ui, () =>
        beginRename(terminal, origin, {
          context: currentContext(snapshot),
          view: currentState(snapshot).view,
          target: currentTarget(snapshot),
          request: ++request,
        }),
      )
    },
    changeRenameDraft: (id: string, draft: string): void =>
      setRename(ui, (current) =>
        changeDraft(current, currentContext(workspace.getSnapshot()), id, draft),
      ),
    saveRename: (id: string): void => {
      const current = active()
      if (current?.id === id) finishRename(current, true)
    },
    cancelRename: (id: string): void => {
      const current = active()
      if (current?.id === id) finishRename(current, false)
    },
  }
}

export const useTerminalRename = ({
  context,
  view,
  terminals,
  selected,
}: TerminalRenameOptions): TerminalRenameController => {
  const { ui, workspace } = useWorkspaceServices()
  const renameSession = useStoreSelector(ui, selectRename)
  const operations = useMemo(() => createRenameOperations({ ui, workspace }), [ui, workspace])
  const { finishRename } = operations
  const activeRename = renameSession?.context === context ? renameSession : null
  // A rename left behind by a session, view or terminal change saves itself.
  useEffect(() => {
    if (!renameSession) return
    if (
      renameSession.context === context &&
      renameSession.view === view &&
      terminals.some((terminal) => terminal.id === renameSession.id)
    )
      return
    let canceled = false
    queueMicrotask(() => {
      if (!canceled) finishRename(renameSession, true)
    })
    return () => {
      canceled = true
    }
  }, [context, finishRename, renameSession, terminals, view])
  // So does one whose terminal is no longer selected.
  const lastSelectedForRename = useRef(selected)
  useEffect(() => {
    const changed = lastSelectedForRename.current !== selected
    lastSelectedForRename.current = selected
    if (!changed || !activeRename || activeRename.id === selected) return
    let canceled = false
    queueMicrotask(() => {
      if (!canceled) finishRename(activeRename, true)
    })
    return () => {
      canceled = true
    }
  }, [activeRename, finishRename, selected])
  return { ...operations, activeRename, renameView: renameView(activeRename) }
}
