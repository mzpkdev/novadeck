import { standingFinish, finishGraceMs, sightTurnEnd, type SeenEnd } from "../model/agent-finish"
import type { MurmurState } from "../model/murmur"
import type { Store } from "../model/store"
import type { TerminalMetadata, Workspace } from "../model/types"
import { formatSize } from "../model/voice-format"

// The one-time offer of Murmur: a chip beside the title of the first terminal whose agent
// finished a turn, the moment naming terminals shows its worth. Nothing downloads before
// Turn on.

// How many sessions of the app the offer comes up in, answered or not.
export const offerSessions = 3

// Whether the offer stands now: Murmur has an engine here, is not on the computer, was not
// turned down, is not known to fail on this computer, and nothing is happening to it.
export const offerable = (state: MurmurState): boolean =>
  state.available &&
  !state.installed &&
  state.wanted &&
  state.unsupported === null &&
  state.installing === null &&
  state.failure === null

// Whether the offer may come up in this session: it stands, and has not used its sessions.
export const offerDue = (state: MurmurState): boolean =>
  offerable(state) && state.offers < offerSessions

// Whether a terminal's title is still the plain name of its agent or program, which Murmur
// would replace, and not one the person, an agent or Murmur gave.
export const plainTitle = (terminal: Pick<TerminalMetadata, "titleSource">): boolean =>
  terminal.titleSource === undefined || terminal.titleSource.kind === "default"

export const offerText = {
  chip: "Name it for me",
  title: "Name terminals from what they do",
  body: (state: MurmurState): string =>
    `A small model on this computer reads the agent's work and names each terminal. ${formatSize(state.sizes.engine + state.sizes.model)} once.`,
  quiet: "It stays in Preferences → Addons.",
  accept: "Turn on",
  decline: "No thanks",
} as const

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

// Calls `onFinish` with the session context and id of each terminal whose agent's turn ends
// complete, in any session, as the finish notices tell it (a terminal first seen only takes
// in what it shows, and a completed end waits `graceMs` in case the person's Escape turns it
// interrupted). Returns the unsubscribe.
export const watchAgentFinishes = (
  workspace: Store<Workspace>,
  onFinish: (terminal: { readonly context: string; readonly id: string }) => void,
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
        if (current && standingFinish(current, next))
          onFinish({ context: key.slice(0, key.length - current.id.length - 1), id: current.id })
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
