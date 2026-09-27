import type { Project, TerminalSummary, WorkspaceSession } from "@novadeck/protocol"

import type { SessionSeed, WorkspaceSeed } from "../../model/seed"
import type { TerminalMetadata } from "../../model/types"
import { terminalActivity } from "./activity"
import { decodeSession, type SavedTerminal } from "./session-state"

// Everything the runner reported at startup, one entry per project.
export type RunnerListing = readonly {
  readonly project: Project
  readonly sessions: readonly {
    readonly session: WorkspaceSession
    readonly terminals: readonly TerminalSummary[]
  }[]
}[]

export const terminalName = (number: number): string =>
  `Terminal ${String(number).padStart(2, "0")}`

// A terminal the UI has just asked for, before the runner reports on it.
export const startingTerminal = (
  id: string,
  number: number,
  directory: string,
): TerminalMetadata => ({
  id,
  name: terminalName(number),
  directory,
  command: "",
  process: "",
  kind: "shell",
  state: "starting",
})

const liveTerminal = (saved: SavedTerminal, summary: TerminalSummary): TerminalMetadata => {
  const { status, process } = terminalActivity(summary)
  return {
    ...saved,
    command: "",
    process: process?.process ?? "",
    kind: process?.kind ?? "shell",
    ...status,
  }
}

// A saved terminal whose process the runner no longer has, as after a restart.
const endedTerminal = (saved: SavedTerminal): TerminalMetadata => ({
  ...saved,
  command: "",
  process: "",
  kind: "shell",
  state: "ended",
})

// A session's seed and where it sorts: by last visit, then by how open it was.
type Ranked = { readonly seed: SessionSeed; readonly order: readonly [number, number] }

// Saved terminals keep their names and places; the runner's other running terminals
// in the session follow with default names, numbered on from the saved counter.
// Exited terminals the save does not know were closed here or elsewhere; they stay out.
const sessionSeed = (session: WorkspaceSession, summaries: readonly TerminalSummary[]): Ranked => {
  const saved = decodeSession(session.state)
  const live = new Map(summaries.map((summary) => [summary.id, summary]))
  const known = saved?.state.roster.terminals ?? []
  const kept = known.map((terminal) => {
    const summary = live.get(terminal.id)
    return summary ? liveTerminal(terminal, summary) : endedTerminal(terminal)
  })
  const first = saved?.state.roster.nextNumber ?? 1
  const extra = summaries
    .filter(
      (summary) =>
        summary.status === "running" && !known.some((terminal) => terminal.id === summary.id),
    )
    .map((summary, index) =>
      liveTerminal(
        { id: summary.id, name: terminalName(first + index), directory: summary.cwd },
        summary,
      ),
    )
  const terminals = [...kept, ...extra]
  // Visit times are epoch milliseconds, so -1 sorts a session never saved last.
  if (!saved) return { seed: { id: session.id, name: session.name, terminals }, order: [-1, 0] }
  const seed: SessionSeed = {
    id: session.id,
    name: session.name,
    terminals,
    visitedAt: saved.visitedAt,
    restored: {
      ...saved.state,
      roster: {
        ...saved.state.roster,
        order: [...saved.state.roster.order],
        terminals: kept,
      },
    },
  }
  return { seed, order: [saved.visitedAt, saved.rank] }
}

const later = (a: Ranked | undefined, b: Ranked | undefined): number => {
  const [visitA, rankA] = a?.order ?? [-2, 0]
  const [visitB, rankB] = b?.order ?? [-2, 0]
  return visitA - visitB || rankA - rankB
}

// The workspace as the runner left it: sessions most recently visited first, and the
// project visited last opens. Sessions visited at the same moment, as a switch leaves
// them, sort the one that was open first. Sessions never saved follow in the runner's order.
export const runnerSeed = (listing: RunnerListing): WorkspaceSeed => {
  const ranked = listing.map(({ project, sessions }) => ({
    project,
    sessions: sessions
      .map(({ session, terminals }) => sessionSeed(session, terminals))
      .toSorted((a, b) => later(b, a)),
  }))
  const latest = ranked.reduce<(typeof ranked)[number] | undefined>(
    (best, item) =>
      best?.sessions[0] && later(item.sessions[0], best.sessions[0]) <= 0 ? best : item,
    undefined,
  )
  const projects = ranked.map(({ project, sessions }) => ({
    id: project.id,
    name: project.name,
    directory: project.cwd,
    sessions: sessions.map((session) => session.seed),
  }))
  return latest?.sessions[0] && latest.sessions[0].order[0] >= 0
    ? { projects, activeProjectId: latest.project.id }
    : { projects }
}
