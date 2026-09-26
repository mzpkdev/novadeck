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
  const snapshots = new Map<string, TerminalRuntimeSnapshot>()
  const terminals = new Map<string, TerminalMetadata>()
  const listeners = new Map<string, Set<() => void>>()
  const publish = (id: string): void => listeners.get(id)?.forEach((listener) => listener())
  const update = (
    key: TerminalKey,
    change: (previous: TerminalRuntimeSnapshot) => TerminalRuntimeSnapshot,
  ): void => {
    const id = keyId(key)
    const previous = snapshots.get(id)
    // A callback retained by a closed presentation must not recreate a process.
    if (!previous) return
    const next = change(previous)
    if (next === previous) return
    snapshots.set(id, next)
    publish(id)
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
          if (!snapshots.has(id)) snapshots.set(id, { ...empty, cleared: added.has(id) })
        }
    for (const id of snapshots.keys()) {
      if (remaining.has(id)) continue
      snapshots.delete(id)
      terminals.delete(id)
      publish(id)
    }
  }
  reconcile(workspace)
  return {
    getSnapshot: (key: TerminalKey): TerminalRuntimeSnapshot => snapshots.get(keyId(key)) ?? empty,
    subscribe: (key: TerminalKey, listener: () => void): (() => void) => {
      const id = keyId(key)
      const subscribers = listeners.get(id) ?? new Set<() => void>()
      subscribers.add(listener)
      listeners.set(id, subscribers)
      return () => {
        subscribers.delete(listener)
        if (!subscribers.size) listeners.delete(id)
      }
    },
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
