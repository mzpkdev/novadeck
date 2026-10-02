import type { DeliveryState, MessageState, TerminalMessages } from "@novadeck/protocol"

/**
 * A terminal's messages as a client saw them at one moment: its delivery state and each
 * message's state, numbered in the order they came.
 */
export type Snapshot = {
  /** Its place in the terminal's history, from 0. */
  readonly index: number
  /** When it came, in milliseconds since the epoch. */
  readonly at: number
  readonly delivery: DeliveryState
  readonly paused: boolean
  /** Every message the terminal sent or received, oldest first within each thread. */
  readonly messages: readonly {
    readonly id: string
    readonly from: string
    readonly to: string
    readonly state: MessageState
  }[]
}

/** What a snapshot must be to be reached: a delivery state, or a test of the snapshot. */
export type Reach = DeliveryState | ((snapshot: Snapshot) => boolean)

export type ReachOptions = {
  /** A `mark`: only snapshots from it on count. From the start when omitted. */
  readonly after?: number
  /** Thirty seconds unless given. */
  readonly timeoutMs?: number
}

/**
 * Every listing of a terminal's messages, from the first, as a watch of them delivers
 * each change: no state between two looks at it is missed, as one that polled could. A
 * burst of changes within one tick reaches it, as any client, as one listing.
 */
export type History = {
  /** Records a listing as the next snapshot. */
  readonly push: (listing: TerminalMessages) => void
  /** Ends the history: waits still pending fail, saying why. */
  readonly end: (why: string) => void
  readonly snapshots: () => readonly Snapshot[]
  /** How many snapshots there are so far: a cursor `reached` takes as `after`. */
  readonly mark: () => number
  /**
   * The first snapshot from `after` on that is what's asked, as soon as there is one. On
   * timeout it fails with the delivery states the terminal went through from `after` on.
   */
  readonly reached: (what: Reach, options?: ReachOptions) => Promise<Snapshot>
}

const snapshotOf = (listing: TerminalMessages, index: number): Snapshot => ({
  index,
  at: Date.now(),
  delivery: listing.delivery,
  paused: listing.paused,
  messages: listing.threads.flatMap((thread) =>
    thread.messages.map(({ id, from, to, state }) => ({ id, from, to, state })),
  ),
})

const test = (what: Reach) =>
  typeof what === "function" ? what : (snapshot: Snapshot) => snapshot.delivery === what

/**
 * The delivery states snapshots went through, a state repeated as only a message changed
 * shown once, and the messages' states at the last: `t2: ready → ringing → unknown;
 * messages m-1 delivered`.
 */
export const transitions = (handle: string, snapshots: readonly Snapshot[]): string => {
  const states = snapshots
    .map((snapshot) => snapshot.delivery)
    .filter((state, index, all) => index === 0 || state !== all[index - 1])
  const last = snapshots.at(-1)?.messages ?? []
  const messages = last.map((message) => `${message.id} ${message.state}`).join(", ")
  return `${handle}: ${states.join(" → ") || "(no change)"}${messages ? `; messages ${messages}` : ""}`
}

/** A terminal's history of messages, named by its handle in what a failed wait says. */
export const createHistory = (handle: string): History => {
  const snapshots: Snapshot[] = []
  const waiters = new Set<{
    readonly see: (snapshot: Snapshot) => void
    readonly fail: (why: string) => void
  }>()
  let ended: string | undefined

  return {
    push: (listing) => {
      if (ended !== undefined) return
      const snapshot = snapshotOf(listing, snapshots.length)
      snapshots.push(snapshot)
      for (const waiter of waiters) waiter.see(snapshot)
    },
    end: (why) => {
      ended ??= why
      for (const waiter of waiters) waiter.fail(why)
    },
    snapshots: () => snapshots,
    mark: () => snapshots.length,
    reached: (what, { after = 0, timeoutMs = 30_000 } = {}) => {
      const matches = test(what)
      const found = snapshots.slice(after).find(matches)
      if (found) return Promise.resolve(found)
      const wanted = typeof what === "function" ? "the state asked for" : what
      // What it went through from the mark on, from the state it was in at the mark.
      const since = () => snapshots.slice(Math.max(after - 1, 0))
      if (ended !== undefined)
        return Promise.reject(
          new Error(`${handle} can't reach ${wanted}: ${ended}. ${transitions(handle, since())}`),
        )
      return new Promise((resolve, reject) => {
        const waiter = {
          see: (snapshot: Snapshot) => {
            if (!matches(snapshot)) return
            settle()
            resolve(snapshot)
          },
          fail: (why: string) => {
            settle()
            reject(
              new Error(`${handle} can't reach ${wanted}: ${why}. ${transitions(handle, since())}`),
            )
          },
        }
        const timer = setTimeout(() => waiter.fail(`timed out after ${timeoutMs} ms`), timeoutMs)
        const settle = () => {
          clearTimeout(timer)
          waiters.delete(waiter)
        }
        waiters.add(waiter)
      })
    },
  }
}
