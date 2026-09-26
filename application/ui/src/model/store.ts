import { workspaceReducer, type WorkspaceAction } from "./state"
import type { Workspace } from "./types"

export type WorkspaceTransaction =
  | readonly WorkspaceAction[]
  | ((workspace: Workspace) => readonly WorkspaceAction[])

export const createWorkspaceStore = (
  initial: Workspace,
  onCommit?: (workspace: Workspace, actions: readonly WorkspaceAction[]) => void,
) => {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const transact = (transaction: WorkspaceTransaction): Workspace => {
    const actions = typeof transaction === "function" ? transaction(snapshot) : transaction
    const next = actions.reduce(workspaceReducer, snapshot)
    if (next === snapshot) return snapshot
    snapshot = next
    onCommit?.(snapshot, actions)
    listeners.forEach((listener) => listener())
    return snapshot
  }
  return {
    getSnapshot: (): Workspace => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispatch: (action: WorkspaceAction): Workspace => transact([action]),
    transact,
  }
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
