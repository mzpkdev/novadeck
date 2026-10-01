import type { Message, Thread, Work } from "./mailbox.js"

/** A terminal's handle in its project, and since when the terminal is gone, if it is. */
export type HandleRecord = {
  readonly terminalId: string
  readonly projectId: string
  readonly handle: string
  /** When the runner found neither the terminal nor its saved record, in epoch milliseconds. */
  readonly removedAt: number | null
}

/**
 * Where the mailbox is kept: the workspace's store, so messages, handles and the pause
 * outlive the runner. Each write is the whole record.
 */
export type MailboxRecords = {
  handles(): readonly HandleRecord[]
  /**
   * The terminal's handle; one it has none gets the next in its project for `prefix`,
   * never one used there before.
   */
  assignHandle(terminalId: string, projectId: string, prefix: string): string
  /** Whether the runner keeps a saved record of the terminal, which keeps its messages. */
  terminalSaved(terminalId: string): boolean
  /** Marks the terminal gone since `at`, or present again with null. */
  markRemoved(terminalId: string, at: number | null): void
  removeHandles(terminalIds: readonly string[]): void
  messages(): readonly Message[]
  saveMessage(message: Message): void
  removeMessages(ids: readonly string[]): void
  threads(): readonly Thread[]
  saveThread(thread: Thread): void
  removeThreads(ids: readonly string[]): void
  /** What each terminal's agent session worked on, kept with the terminal's record. */
  works(): readonly { readonly terminalId: string; readonly work: Work }[]
  saveWork(terminalId: string, work: Work): void
  messagingPaused(): boolean
  pauseMessaging(paused: boolean): void
}

/** A mailbox kept in memory only, for a runner without a store. */
export const memoryMailbox = (): MailboxRecords => {
  const handles = new Map<string, HandleRecord>()
  const counters = new Map<string, number>()
  const messages = new Map<string, Message>()
  const threads = new Map<string, Thread>()
  const works = new Map<string, Work>()
  let paused = false
  return {
    handles: () => [...handles.values()],
    assignHandle(terminalId, projectId, prefix) {
      const known = handles.get(terminalId)
      if (known) return known.handle
      const key = `${projectId}\0${prefix}`
      const next = (counters.get(key) ?? 0) + 1
      counters.set(key, next)
      const handle = `${prefix}-${next}`
      handles.set(terminalId, { terminalId, projectId, handle, removedAt: null })
      return handle
    },
    terminalSaved: () => false,
    markRemoved(terminalId, at) {
      const known = handles.get(terminalId)
      if (known) handles.set(terminalId, { ...known, removedAt: at })
    },
    removeHandles(ids) {
      for (const id of ids) handles.delete(id)
    },
    messages: () => [...messages.values()],
    saveMessage: (message) => void messages.set(message.id, message),
    removeMessages(ids) {
      for (const id of ids) messages.delete(id)
    },
    threads: () => [...threads.values()],
    saveThread: (thread) => void threads.set(thread.id, thread),
    removeThreads(ids) {
      for (const id of ids) threads.delete(id)
    },
    works: () => [...works].map(([terminalId, work]) => ({ terminalId, work })),
    saveWork: (terminalId, work) => void works.set(terminalId, work),
    messagingPaused: () => paused,
    pauseMessaging(value) {
      paused = value
    },
  }
}
