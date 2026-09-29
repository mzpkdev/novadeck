import type { AgentActivity } from "@novadeck/protocol"

import type { Binding } from "./bindings.js"
import type { ActivityEvent } from "./events.js"

/** A request waiting on the person, as its harness identified it. */
type Request = {
  readonly requestId: string
  readonly toolName: string
  readonly kind: "permission" | "question"
}

/**
 * What the bound agent is doing, as its hooks said: `at` is when the latest applied hook
 * started, so a hook that started earlier but arrived later changes nothing.
 */
export type Activity = {
  readonly state: "working" | "idle"
  readonly pending: readonly Request[]
  readonly at: number
}

/** A freshly bound agent waits for its first prompt. */
export const started = (at: number): Activity => ({ state: "idle", pending: [], at })

/** Whether an event belongs to the bound session, from its own process where known. */
const bound = (binding: Binding, event: ActivityEvent): boolean =>
  binding.agent === event.agent &&
  binding.sessionId === event.sessionId &&
  (binding.instance === null || event.instance === null || binding.instance === event.instance)

/**
 * The activity after an event, or undefined when it changes nothing: another session's,
 * or older than the latest applied. A turn's start or end settles every request still
 * waiting, since no harness reports a denial: the person answered it one way or another.
 */
export const apply = (
  activity: Activity,
  binding: Binding,
  event: ActivityEvent,
): Activity | undefined => {
  if (!bound(binding, event) || event.startedAt < activity.at) return undefined
  const at = event.startedAt
  switch (event.type) {
    case "turn-started":
      return { state: "working", pending: [], at }
    case "turn-ended":
      return { state: "idle", pending: [], at }
    case "attention-requested":
      return activity.pending.some(({ requestId }) => requestId === event.requestId)
        ? undefined
        : {
            state: "working",
            pending: [
              ...activity.pending,
              { requestId: event.requestId, toolName: event.toolName, kind: event.kind },
            ],
            at,
          }
    case "attention-resolved": {
      // The same call, or else the oldest waiting call of that tool.
      const exact = activity.pending.findIndex(({ requestId }) => requestId === event.requestId)
      const index =
        exact >= 0
          ? exact
          : activity.pending.findIndex(({ toolName }) => toolName === event.toolName)
      if (index < 0) return undefined
      return { ...activity, pending: activity.pending.toSpliced(index, 1), at }
    }
  }
}

/** The activity as clients see it. */
export const summary = ({ state, pending }: Activity): AgentActivity => ({
  state,
  attention: { pending: pending.length, kind: pending[0]?.kind ?? null },
})
