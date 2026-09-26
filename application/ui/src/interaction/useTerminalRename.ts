import { useCallback, useEffect, useRef, useState } from "react"

import type { WorkspaceAction } from "../model/state"
import type { TerminalMetadata, ViewMode, WorkspaceTarget } from "../model/types"
import type { TerminalRename } from "../terminals/TerminalRenameInput"

type RenameSession = {
  context: string
  id: string
  original: string
  draft: string
  origin: "sidebar" | "header"
  view: ViewMode
  target: WorkspaceTarget
  request: number
}

export const useTerminalRename = ({
  context,
  view,
  target,
  sessions,
  selected,
  dispatch,
}: {
  context: string
  view: ViewMode
  target: WorkspaceTarget
  sessions: TerminalMetadata[]
  selected: string
  dispatch: (action: WorkspaceAction) => void
}) => {
  const [renameSession, setRenameSession] = useState<RenameSession | null>(null)
  const renameRequest = useRef(0)
  const activeRename = renameSession?.context === context ? renameSession : null
  const renameView: TerminalRename | null = activeRename
    ? {
        id: activeRename.id,
        value: activeRename.draft,
        request: activeRename.request,
        origin: activeRename.origin,
      }
    : null
  const finishRename = useCallback(
    (rename: RenameSession, save: boolean): void => {
      const name = rename.draft.trim()
      if (save && name && name !== rename.original)
        dispatch({ type: "terminal/rename", target: rename.target, terminalId: rename.id, name })
      setRenameSession((previous) => (previous?.request === rename.request ? null : previous))
    },
    [dispatch, setRenameSession],
  )
  const startRename = (session: TerminalMetadata, origin: RenameSession["origin"]): void => {
    if (activeRename?.id === session.id) return
    if (activeRename) finishRename(activeRename, true)
    setRenameSession({
      context,
      id: session.id,
      original: session.name,
      draft: session.name,
      origin,
      view,
      target,
      request: ++renameRequest.current,
    })
  }
  const changeRenameDraft = (id: string, draft: string): void =>
    setRenameSession((previous) =>
      previous?.context === context && previous.id === id ? { ...previous, draft } : previous,
    )
  const saveRename = (id: string): void => {
    if (activeRename?.id === id) finishRename(activeRename, true)
  }
  const cancelRename = (id: string): void => {
    if (activeRename?.id === id) finishRename(activeRename, false)
  }
  useEffect(() => {
    if (!renameSession) return
    if (
      renameSession.context === context &&
      renameSession.view === view &&
      sessions.some((session) => session.id === renameSession.id)
    )
      return
    let canceled = false
    queueMicrotask(() => {
      if (!canceled) finishRename(renameSession, true)
    })
    return () => {
      canceled = true
    }
  }, [context, finishRename, renameSession, sessions, view])
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
    activeRename,
    renameView,
    startRename,
    changeRenameDraft,
    saveRename,
    cancelRename,
    finishRename,
  }
}
