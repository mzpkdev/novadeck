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
  let committing = false
  const listeners = new Set<() => void>()
  const transact = (transaction: WorkspaceTransaction): Workspace => {
    // A commit hook that starts another transaction would see its own commit out of order.
    if (committing) throw new Error("A workspace transaction cannot start inside a commit")
    const actions = typeof transaction === "function" ? transaction(snapshot) : transaction
    const next = actions.reduce(workspaceReducer, snapshot)
    if (next === snapshot) return snapshot
    snapshot = next
    committing = true
    try {
      onCommit?.(snapshot, actions)
    } finally {
      committing = false
    }
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
