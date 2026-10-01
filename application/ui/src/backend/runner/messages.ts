import type { TerminalMessages } from "@novadeck/protocol"

import { companionKeyId, type CompanionKey } from "../../model/companion"
import { noMail, type MailState, type Messages, type TerminalMail } from "../../model/messages"
import { createStore } from "../../model/store"

// The runner's messages between agents: each terminal's threads as `messages.watch`
// streams them, and the one pause switch, which every listing reports. A pause the runner
// accepted is so; a release goes on once a listing shows its thread no longer held, as a
// listing may come before or after the runner's answer.

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

// Whether some listing has the thread, and not held.
const goesOn = (current: MailState, thread: string): boolean =>
  Object.values(current.terminals).some((mail) =>
    mail.threads.some((each) => each.id === thread && !each.held),
  )

const reason = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : String(error)

export const createRunnerMessages = (
  streams: MailStreams,
  // Keeps a call the backend waits for before it stops, as its other calls are.
  track: <T>(work: Promise<T>) => Promise<T> = (work) => work,
): RunnerMessages => {
  const state = createStore<MailState>(noMail)
  // Releases the runner accepted, waiting for a listing to show their threads go on.
  const accepted = new Set<string>()
  // Threads accepted and shown going on are no longer releasing.
  const settled = (current: MailState): MailState => {
    const done = current.releasing.filter(
      (thread) => accepted.has(thread) && goesOn(current, thread),
    )
    if (!done.length) return current
    for (const thread of done) accepted.delete(thread)
    return { ...current, releasing: current.releasing.filter((thread) => !done.includes(thread)) }
  }
  const followed = new Map<string, AsyncIterableIterator<TerminalMessages, undefined>>()

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
          state.update((current) =>
            settled({
              ...current,
              paused: listing.paused,
              terminals: { ...current.terminals, [id]: mailOf(listing) },
            }),
          )
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
      state.update((current) => ({ ...current, pending: true, error: null }))
      track(streams.pause(paused)).then(
        // The runner took it: it is so, whichever comes first, this or the listings.
        () => state.update((current) => ({ ...current, paused, pending: false })),
        (error: unknown) =>
          state.update((current) => ({
            ...current,
            pending: false,
            error: `Couldn't ${paused ? "pause" : "resume"} messaging: ${reason(error)}`,
          })),
      )
    },
    release: (thread) => {
      accepted.delete(thread)
      state.update((current) => {
        const { [thread]: _before, ...failed } = current.failed
        return {
          ...current,
          releasing: [...current.releasing.filter((each) => each !== thread), thread],
          failed,
        }
      })
      track(streams.release(thread)).then(
        () => {
          accepted.add(thread)
          state.update(settled)
        },
        (error: unknown) =>
          state.update((current) => ({
            ...current,
            releasing: current.releasing.filter((each) => each !== thread),
            failed: { ...current.failed, [thread]: `Couldn't release it: ${reason(error)}` },
          })),
      )
    },
    follow,
    unfollow,
    stop: () => {
      for (const [id, stream] of followed) {
        followed.delete(id)
        void stream.return?.()
      }
      state.update((current) => ({ ...current, terminals: {} }))
    },
  }
}
