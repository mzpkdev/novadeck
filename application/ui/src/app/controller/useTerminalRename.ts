import { useEffect, useRef } from "react"

import type { TerminalMetadata, ViewMode } from "../../model/types"
import { renameView, type RenameSession } from "../../terminals/rename-state"
import type { TerminalRename } from "../../terminals/TerminalRenameInput"
import type { RenameCommands } from "../commands/rename"
import type { UiState } from "../ui-store"
import { useWorkspaceServices } from "./context"
import { useStoreSelector } from "./useStoreSelector"

export type TerminalRenameOptions = {
  context: string
  view: ViewMode
  terminals: TerminalMetadata[]
  selected: string
}

export type TerminalRenameController = Omit<RenameCommands, "activeRename"> & {
  readonly activeRename: RenameSession | null
  readonly renameView: TerminalRename | null
}

const selectRename = (state: UiState): RenameSession | null => state.rename

export const useTerminalRename = ({
  context,
  view,
  terminals,
  selected,
}: TerminalRenameOptions): TerminalRenameController => {
  const { ui, commands } = useWorkspaceServices()
  const renameSession = useStoreSelector(ui, selectRename)
  const { finishRename } = commands
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
  return {
    startRename: commands.startRename,
    changeRenameDraft: commands.changeRenameDraft,
    saveRename: commands.saveRename,
    cancelRename: commands.cancelRename,
    finishRename,
    activeRename,
    renameView: renameView(activeRename),
  }
}
