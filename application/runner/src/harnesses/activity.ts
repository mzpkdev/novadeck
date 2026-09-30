import type { AgentActivity } from "@novadeck/protocol"

import type { Binding } from "./bindings.js"
import type { ActivityEvent } from "./events.js"

/** A request waiting on the person, as its harness identified it. */
type Request = {
  readonly requestId: string
  readonly actor: string | null
  readonly toolName: string
  readonly kind: "permission" | "question"
}

/** A subagent running under the bound agent, since its start hook started. */
type Subagent = { readonly id: string; readonly type: string | null; readonly startedAt: number }

// More than any agent runs at once; a runaway harness cannot grow the summary.
const maxSubagents = 32
// How many ended subagents are remembered, so a start arriving after its end is ignored.
const maxEnded = 64
// What the protocol carries of an id or a kind.
const maxText = 256

/**
 * What the bound agent is doing, as its hooks said. `turnAt` is when the hook of the
 * latest turn start or end started: a fact from a hook that started before it belongs to
 * a turn already over, however late it arrives. Requests of one turn arrive in any order.
 * Subagents outlive turns, as a background one does, so no turn fences them; `ended`
 * names those that stopped, and `interrupted` spans the latest interrupted turn, whose
 * subagents stopped with it, so a start that arrives late is not taken for a new one.
 */
export type Activity = {
  readonly state: "working" | "idle"
  readonly pending: readonly Request[]
  readonly subagents: readonly Subagent[]
  readonly ended: readonly string[]
  readonly interrupted: { readonly from: number; readonly to: number } | null
  readonly turnAt: number
}

/** A freshly bound agent waits for its first prompt. */
export const started = (at: number): Activity => ({
  state: "idle",
  pending: [],
  subagents: [],
  ended: [],
  interrupted: null,
  turnAt: at,
})

const end = (ended: readonly string[], ids: readonly string[]): readonly string[] =>
  [...ended, ...ids].slice(-maxEnded)

/** Whether an event belongs to the bound session, from its own process where known. */
export const bound = (
  binding: Binding,
  event: Pick<ActivityEvent, "agent" | "sessionId" | "instance">,
): boolean =>
  binding.agent === event.agent &&
  binding.sessionId === event.sessionId &&
  (binding.instance === null || event.instance === null || binding.instance === event.instance)

/** The index of the request a result resolves: its own call, or loosely the actor's oldest. */
const resolved = (
  pending: readonly Request[],
  event: Extract<ActivityEvent, { type: "attention-resolved" }>,
): number => {
  const exact = pending.findIndex(({ requestId }) => requestId === event.requestId)
  if (exact >= 0 || !event.loose) return exact
  return pending.findIndex(
    ({ actor, toolName }) => actor === event.actor && toolName === event.toolName,
  )
}

/**
 * The activity after an event, or undefined when it changes nothing: another session's,
 * or from a turn already over. A turn's start or end settles every request still
 * waiting, since no harness reports a denial: the person answered it one way or another.
 * An interrupted turn ends the subagents it started, which report no stop then; a
 * background one from an earlier turn runs on.
 */
export const apply = (
  activity: Activity,
  binding: Binding,
  event: ActivityEvent,
): Activity | undefined => {
  if (!bound(binding, event)) return undefined
  switch (event.type) {
    case "subagent-started": {
      const { subagents, ended, interrupted } = activity
      const { actor: id, startedAt } = event
      if (
        id.length > maxText ||
        subagents.length >= maxSubagents ||
        subagents.some((subagent) => subagent.id === id) ||
        ended.includes(id) ||
        (interrupted && startedAt >= interrupted.from && startedAt < interrupted.to)
      )
        return undefined
      const type = event.actorType?.slice(0, maxText) ?? null
      return { ...activity, subagents: [...subagents, { id, type, startedAt }] }
    }
    case "subagent-stopped": {
      const { subagents, ended } = activity
      if (event.actor.length > maxText || ended.includes(event.actor)) return undefined
      // A stop may arrive before its start: remembered, it keeps the start out.
      return {
        ...activity,
        subagents: subagents.filter(({ id }) => id !== event.actor),
        ended: end(ended, [event.actor]),
      }
    }
  }
  if (event.startedAt < activity.turnAt) return undefined
  switch (event.type) {
    case "turn-started":
      return { ...activity, state: "working", pending: [], turnAt: event.startedAt }
    case "turn-ended": {
      const turn = { state: "idle", pending: [], turnAt: event.startedAt } as const
      if (event.outcome !== "interrupted") return { ...activity, ...turn }
      const stopped = activity.subagents.filter(({ startedAt }) => startedAt >= activity.turnAt)
      return {
        ...turn,
        subagents: activity.subagents.filter((subagent) => !stopped.includes(subagent)),
        ended: end(
          activity.ended,
          stopped.map(({ id }) => id),
        ),
        interrupted: { from: activity.turnAt, to: event.startedAt },
      }
    }
    case "attention-requested": {
      if (activity.pending.some(({ requestId }) => requestId === event.requestId)) return undefined
      const { requestId, actor, toolName, kind } = event
      return {
        ...activity,
        state: "working",
        pending: [...activity.pending, { requestId, actor, toolName, kind }],
      }
    }
    case "attention-resolved": {
      const index = resolved(activity.pending, event)
      if (index < 0) return undefined
      return { ...activity, pending: activity.pending.toSpliced(index, 1) }
    }
  }
}

/** The activity as clients see it. */
export const summary = ({ state, pending, subagents }: Activity): AgentActivity => ({
  state,
  attention: { pending: pending.length, kind: pending[0]?.kind ?? null },
  subagents: subagents.map(({ id, type }) => ({ id, type })),
})
