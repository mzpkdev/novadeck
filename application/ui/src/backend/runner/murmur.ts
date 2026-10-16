import type { MurmurState as WireMurmurState } from "@novadeck/protocol"
import type { Runner } from "@novadeck/protocol/client"

import { changeNames, type Murmur, type MurmurState } from "../../model/murmur"
import { createStore } from "../../model/store"

// The runner's murmur addon: its state as `murmur.watch` streams it, and installs and
// settings as calls whose failures show in that state until the next snapshot.

export type MurmurCalls = Runner["murmur"]

export type RunnerMurmur = {
  readonly murmur: Murmur
  // Follows the addon's state; once started it goes on across reconnections.
  readonly follow: () => void
  readonly stop: () => void
}

// Before the runner's first snapshot nothing is installed. The addon counts as available:
// a runner without an engine says so in its first snapshot, and a call that fails says why.
export const noMurmur: MurmurState = {
  available: true,
  installed: false,
  enabled: false,
  // Nothing is offered until the runner says it is wanted.
  wanted: false,
  sizes: { engine: 0, model: 0 },
  installing: null,
  check: null,
  unsupported: null,
  recheck: false,
  unchecked: false,
  offers: 0,
  failure: null,
}

const reason = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : String(error)

export const createRunnerMurmur = (
  calls: MurmurCalls,
  // Keeps a call the backend waits for before it stops, as its other calls are.
  track: <T>(work: Promise<T>) => Promise<T> = (work) => work,
): RunnerMurmur => {
  const state = createStore<MurmurState>(noMurmur)
  let stream: AsyncIterableIterator<WireMurmurState, undefined> | undefined

  const follow = (): void => {
    if (stream) return
    let next: AsyncIterableIterator<WireMurmurState, undefined>
    try {
      next = calls.watch()
    } catch {
      // Murmur is extra: a runner that can't follow it leaves the addon as it was.
      return
    }
    stream = next
    void (async () => {
      try {
        for await (const snapshot of next) {
          if (stream !== next) return
          state.update(() => snapshot)
        }
      } catch {
        // The runner closed, or has no murmur.
      }
      if (stream === next) stream = undefined
    })()
  }

  // Runs a call that changes the addon; the next snapshot shows its effect, and a
  // rejection shows meanwhile as the failure. Settles once the call has, either way.
  const change = (what: string, call: () => Promise<void>): Promise<void> =>
    track(call()).catch((error: unknown) => {
      state.update((current) => ({
        ...current,
        failure: `Couldn't ${what}: ${reason(error)}`,
      }))
    })

  return {
    murmur: {
      state,
      install: () => void change(changeNames.install, () => calls.install()),
      cancel: () => void change(changeNames.cancel, () => calls.cancel()),
      uninstall: () => change(changeNames.uninstall, () => calls.uninstall()),
      set: (settings) =>
        settings.offered
          ? // Only counted: a count that is not kept is no failure to show.
            void track(calls.set(settings)).catch(() => {})
          : // Its failure is not an install's, which the footer's item leaves alone.
            void change(changeNames.set, () => calls.set(settings)),
      // Murmur is extra: a gist that can't be asked for leaves the reply as it was.
      gist: (terminalId, at) => void track(calls.gist(terminalId, at)).catch(() => {}),
    },
    follow,
    stop: () => {
      const current = stream
      stream = undefined
      void current?.return?.()
    },
  }
}
