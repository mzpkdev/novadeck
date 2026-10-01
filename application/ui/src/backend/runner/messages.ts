import type { TerminalMessages } from "@novadeck/protocol"

import { companionKeyId, type CompanionKey } from "../../model/companion"
import type { MailState, Messages, TerminalMail } from "../../model/messages"
import { createStore } from "../../model/store"

// The runner's messages between agents: each terminal's threads as `messages.watch`
// streams them, and the one pause switch, which every listing reports.

export type MailStreams = {
  readonly watch: (terminalId: string) => AsyncIterableIterator<TerminalMessages, undefined>
  readonly pause: (paused: boolean) => Promise<void>
  readonly release: (thread: string) => Promise<void>
}

export type RunnerMessages = Messages & {
  // The runner has the terminal: follow its messages. Following that ended, as when the
  // runner lost the terminal, starts over; following that runs goes on.
  readonly follow: (key: CompanionKey) => void
  // The terminal is gone: stop following it, and forget its messages.
  readonly unfollow: (key: CompanionKey) => void
  // Stops following every terminal.
  readonly stop: () => void
}

export const mailOf = (listing: TerminalMessages): TerminalMail => ({
  handle: listing.handle,
  agent: listing.delivery !== "unbound",
  threads: listing.threads.map((thread) => ({
    id: thread.id,
    peer: thread.peer,
    hops: thread.hops,
    allowed: thread.allowed,
    held: thread.held,
    messages: thread.messages.map((message) => ({
      id: message.id,
      hop: message.hop,
      from: message.from,
      to: message.to,
      text: message.text,
      sentAt: message.sentAt,
      state: message.state,
      held: message.held,
      deliveredAt: message.deliveredAt,
    })),
  })),
})

export const createRunnerMessages = (streams: MailStreams): RunnerMessages => {
  const state = createStore<MailState>({ paused: false, terminals: {} })
  const followed = new Map<string, AsyncIterableIterator<TerminalMessages, undefined>>()
  // A pause asked for and not yet answered: listings from before it don't undo it.
  let asked: boolean | undefined

  const forget = (id: string): void =>
    void state.update((current) => {
      if (!(id in current.terminals)) return current
      const { [id]: _gone, ...terminals } = current.terminals
      return { ...current, terminals }
    })

  const follow = (key: CompanionKey): void => {
    const id = companionKeyId(key)
    if (followed.has(id)) return
    let stream: AsyncIterableIterator<TerminalMessages, undefined>
    try {
      stream = streams.watch(key.terminalId)
    } catch {
      // Messages are extra: a runner that can't follow them leaves the terminal as it is.
      return
    }
    followed.set(id, stream)
    void (async () => {
      try {
        for await (const listing of stream) {
          if (followed.get(id) !== stream) return
          state.update((current) => ({
            paused: asked ?? listing.paused,
            terminals: { ...current.terminals, [id]: mailOf(listing) },
          }))
        }
      } catch {
        // The runner closed or lost the terminal.
      }
      // Following ended while the terminal is still held: a later `follow` starts over.
      if (followed.get(id) !== stream) return
      followed.delete(id)
      forget(id)
    })()
  }

  const unfollow = (key: CompanionKey): void => {
    const id = companionKeyId(key)
    const stream = followed.get(id)
    followed.delete(id)
    void stream?.return?.()
    forget(id)
  }

  return {
    state,
    pause: (paused) => {
      const before = state.getSnapshot().paused
      asked = paused
      state.update((current) => (current.paused === paused ? current : { ...current, paused }))
      streams.pause(paused).then(
        () => {
          if (asked === paused) asked = undefined
        },
        () => {
          // Not paused after all: the switch shows what the runner still does.
          if (asked !== paused) return
          asked = undefined
          state.update((current) => ({ ...current, paused: before }))
        },
      )
    },
    release: (_key, thread) => {
      // The thread's listing tells once its messages go on; a failed release changes nothing.
      streams.release(thread).catch(() => {})
    },
    follow,
    unfollow,
    stop: () => {
      for (const [id, stream] of followed) {
        followed.delete(id)
        void stream.return?.()
      }
      state.update(() => ({ paused: state.getSnapshot().paused, terminals: {} }))
    },
  }
}
