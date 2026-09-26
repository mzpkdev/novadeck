import { createStore, type StoreApi } from "zustand/vanilla"

import { mockReply } from "../mock/sessions"
import type { Entry, TerminalMetadata, Workspace, WorkspaceTarget } from "../model/types"

export type TerminalKey = WorkspaceTarget & { terminalId: string }
export type TerminalRuntimeSnapshot = {
  draft: string
  scrollOffset: number | undefined
  entries: Entry[]
  cleared: boolean
}

const keyId = (key: TerminalKey): string =>
  JSON.stringify([key.projectId, key.workspaceSessionId, key.terminalId])
const empty: TerminalRuntimeSnapshot = {
  draft: "",
  scrollOffset: undefined,
  entries: [],
  cleared: false,
}

export const createTerminalRuntime = (workspace: Workspace) => {
  const snapshots = new Map<string, StoreApi<TerminalRuntimeSnapshot>>()
  const terminals = new Map<string, TerminalMetadata>()
  const update = (
    key: TerminalKey,
    change: (previous: TerminalRuntimeSnapshot) => TerminalRuntimeSnapshot,
  ): void => {
    const id = keyId(key)
    const store = snapshots.get(id)
    // A callback retained by a closed presentation must not recreate a process.
    if (!store) return
    const previous = store.getState()
    const next = change(previous)
    if (next !== previous) store.setState(next, true)
  }
  const reconcile = (next: Workspace, created: readonly TerminalKey[] = []): void => {
    const added = new Set(created.map(keyId))
    const remaining = new Set<string>()
    for (const project of next.projects)
      for (const session of project.history)
        for (const terminal of session.state.sessions) {
          const id = keyId({
            projectId: project.id,
            workspaceSessionId: session.id,
            terminalId: terminal.id,
          })
          remaining.add(id)
          terminals.set(id, terminal)
          if (!snapshots.has(id))
            snapshots.set(
              id,
              createStore<TerminalRuntimeSnapshot>(() => ({ ...empty, cleared: added.has(id) })),
            )
          else if (added.has(id)) {
            const store = snapshots.get(id)!
            const current = store.getState()
            if (!current.cleared && !current.entries.length && !current.draft) {
              store.setState({ ...current, cleared: true }, true)
            }
          }
        }
    for (const id of snapshots.keys()) {
      if (remaining.has(id)) continue
      const store = snapshots.get(id)!
      snapshots.delete(id)
      terminals.delete(id)
      store.setState(empty, true)
    }
  }
  reconcile(workspace)
  return {
    getSnapshot: (key: TerminalKey): TerminalRuntimeSnapshot =>
      snapshots.get(keyId(key))?.getState() ?? empty,
    subscribe: (key: TerminalKey, listener: () => void): (() => void) =>
      snapshots.get(keyId(key))?.subscribe(listener) ?? (() => {}),
    setDraft: (key: TerminalKey, draft: string): void =>
      update(key, (previous) => (previous.draft === draft ? previous : { ...previous, draft })),
    setScrollOffset: (key: TerminalKey, scrollOffset: number): void =>
      update(key, (previous) =>
        previous.scrollOffset === scrollOffset ? previous : { ...previous, scrollOffset },
      ),
    run: (key: TerminalKey, command: string): void => {
      const terminal = terminals.get(keyId(key))
      if (!terminal || !command.trim()) return
      update(key, (previous) =>
        command.trim() === "clear"
          ? { ...previous, draft: "", cleared: true, entries: [] }
          : {
              ...previous,
              draft: "",
              entries: [
                ...previous.entries,
                { id: crypto.randomUUID(), command, reply: mockReply(command, terminal) },
              ],
            },
      )
    },
    reconcile,
  }
}

export type TerminalRuntimeStore = ReturnType<typeof createTerminalRuntime>
