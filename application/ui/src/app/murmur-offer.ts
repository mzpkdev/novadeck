import { standingFinish, finishGraceMs, sightTurnEnd, type SeenEnd } from "../model/agent-finish"
import type { MurmurState } from "../model/murmur"
import type { Store } from "../model/store"
import type { TerminalMetadata, Workspace } from "../model/types"
import { murmurStepTitles } from "../preferences/murmur-addon"
import { formatSize } from "../preferences/voice-addon"

// The one-time offer of Murmur: a corner card that comes up when the first agent finishes
// a turn, the moment naming terminals shows its worth. Nothing downloads before Turn on.

// Whether the offer may come up: Murmur has an engine here, is not on the computer, was
// not turned down, is not known to fail on this computer, and nothing is happening to it.
export const offerable = (state: MurmurState): boolean =>
  state.available &&
  !state.installed &&
  state.wanted &&
  state.unsupported === null &&
  state.installing === null &&
  state.failure === null

// What the open card shows of Murmur's state. `started` is whether the person pressed
// Turn on in the card, so only their own install ends in the done state.
export type OfferView = "offer" | "working" | "failed" | "done" | "gone"

export const offerView = (state: MurmurState, started: boolean): OfferView => {
  // Can't run here: the card leaves for good.
  if (!state.available || state.unsupported !== null) return "gone"
  if (state.installing) return "working"
  if (state.failure !== null) return "failed"
  if (state.installed) return started && state.enabled && state.check !== null ? "done" : "gone"
  // Pressed, and the runner has not yet said it started.
  return started ? "working" : "offer"
}

export const offerText = {
  title: "Want your terminals to name themselves?",
  body: (state: MurmurState): string =>
    `A small model on this computer reads what agents are doing and names each terminal. Downloads ${formatSize(state.sizes.engine + state.sizes.model)} once.`,
  size: (state: MurmurState): string =>
    `${formatSize(state.sizes.engine + state.sizes.model)} download`,
  quiet: "It stays in Preferences → Addons.",
  accept: "Turn on",
  decline: "No thanks",
  working: "Getting Murmur ready",
  failed: "Couldn't turn on Murmur",
  retry: "Try again",
  later: "Not now",
  done: "Your terminals name themselves now.",
} as const

// What the working card says of the step under way.
export const workingText = ({ installing }: MurmurState): string => {
  if (!installing) return "Starting…"
  const title = murmurStepTitles[installing.step]
  return installing.step === "check"
    ? title
    : `${title} · ${formatSize(installing.received)} of ${formatSize(installing.total)}`
}

const terminalsOf = (workspace: Workspace): Map<string, TerminalMetadata> =>
  new Map(
    workspace.projects.flatMap((project) =>
      project.history.flatMap((session) =>
        session.state.roster.terminals.map(
          (terminal) => [`${project.id}/${session.id}/${terminal.id}`, terminal] as const,
        ),
      ),
    ),
  )

// Calls `onFinish` for each agent turn that ends complete, in any terminal of any session,
// as the finish notices tell it (a terminal first seen only takes in what it shows, and a
// completed end waits `graceMs` in case the person's Escape turns it interrupted). Returns
// the unsubscribe.
export const watchAgentFinishes = (
  workspace: Store<Workspace>,
  onFinish: () => void,
  graceMs = finishGraceMs,
): (() => void) => {
  let previous = workspace.getSnapshot()
  let terminals = terminalsOf(previous)
  const seen = new Map<string, SeenEnd>()
  const waiting = new Set<ReturnType<typeof setTimeout>>()
  for (const [key, terminal] of terminals) seen.set(key, sightTurnEnd(undefined, terminal).seen)
  const unsubscribe = workspace.subscribe(() => {
    const snapshot = workspace.getSnapshot()
    if (snapshot.projects === previous.projects) return
    previous = snapshot
    const before = terminals
    terminals = terminalsOf(snapshot)
    for (const [key, terminal] of terminals) {
      if (before.get(key) === terminal) continue
      const { seen: next, finish } = sightTurnEnd(seen.get(key), terminal)
      seen.set(key, next)
      if (!finish || finish.failed || next === null) continue
      const timer = setTimeout(() => {
        waiting.delete(timer)
        const current = terminals.get(key)
        if (current && standingFinish(current, next)) onFinish()
      }, graceMs)
      waiting.add(timer)
    }
    for (const key of seen.keys()) if (!terminals.has(key)) seen.delete(key)
  })
  return () => {
    unsubscribe()
    for (const timer of waiting) clearTimeout(timer)
    waiting.clear()
  }
}
