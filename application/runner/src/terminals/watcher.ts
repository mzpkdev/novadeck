import type { TerminalChange, TerminalSummary } from "@novadeck/protocol"

/**
 * One watch stream: the current state, one change per key, then `synced`, then later
 * changes. It holds at most one pending change per key, so a slow reader receives the
 * latest change instead of every step, and a key it never saw leaves without a removal.
 */
export class Watcher<Key, Change> {
  private readonly initial: Change[]
  /** Keys reported to the reader, including those still waiting in `initial`. */
  private readonly known: Set<Key>
  private readonly pending = new Map<Key, { readonly change: Change; readonly removal: boolean }>()
  private finished = false
  private wake: (() => void) | undefined

  constructor(current: readonly (readonly [Key, Change])[], synced: Change) {
    this.initial = [...current.map(([, change]) => change), synced]
    this.known = new Set(current.map(([key]) => key))
  }

  changed(key: Key, change: Change): void {
    this.queue(key, { change, removal: false })
  }

  /** Reports the key gone, if the reader was told of it; otherwise drops its pending change. */
  removed(key: Key, change: Change): void {
    if (this.known.has(key)) {
      this.queue(key, { change, removal: true })
      return
    }
    this.pending.delete(key)
  }

  /** Ends the stream, dropping anything not yet read. */
  finish(): void {
    this.finished = true
    this.initial.length = 0
    this.pending.clear()
    this.notify()
  }

  async next(): Promise<Change | undefined> {
    while (true) {
      if (this.initial.length > 0) return this.initial.shift()
      const [entry] = this.pending
      if (entry) {
        const [key, { change, removal }] = entry
        this.pending.delete(key)
        if (removal) this.known.delete(key)
        else this.known.add(key)
        return change
      }
      if (this.finished) return undefined
      // eslint-disable-next-line no-await-in-loop -- Wait for the next change.
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
  }

  /** Moves the key to the back of the queue, so older changes are read first. */
  private queue(key: Key, entry: { readonly change: Change; readonly removal: boolean }): void {
    if (this.finished) return
    this.pending.delete(key)
    this.pending.set(key, entry)
    this.notify()
  }

  private notify(): void {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }
}

/** One `terminals.watch` stream: every terminal's summary, `synced`, then later changes. */
export class TerminalWatcher {
  private readonly watcher: Watcher<string, TerminalChange>

  constructor(terminals: readonly TerminalSummary[]) {
    this.watcher = new Watcher<string, TerminalChange>(
      terminals.map((terminal) => [terminal.id, { type: "changed", terminal }] as const),
      { type: "synced" },
    )
  }

  changed(terminal: TerminalSummary): void {
    this.watcher.changed(terminal.id, { type: "changed", terminal })
  }

  removed(terminal: Pick<TerminalSummary, "id" | "sessionId">): void {
    this.watcher.removed(terminal.id, {
      type: "removed",
      terminalId: terminal.id,
      sessionId: terminal.sessionId,
    })
  }

  finish(): void {
    this.watcher.finish()
  }

  next(): Promise<TerminalChange | undefined> {
    return this.watcher.next()
  }
}
