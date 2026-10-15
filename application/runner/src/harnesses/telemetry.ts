import type { TelemetryObserved } from "@novadeck/harness-core/events"
import type { AgentTelemetry } from "@novadeck/protocol"

import { bound, type LastTurn } from "./activity.js"
import type { Binding } from "./bindings.js"

/**
 * The bound session's tokens and quotas, as of the latest record that named them (`at`),
 * and the model and effort, as of the latest that named those (`modelAt`).
 */
export type Telemetry = AgentTelemetry & { readonly at: number; readonly modelAt: number }

/**
 * The telemetry after a record, or undefined when it changes nothing: another session's,
 * or older than what is shown. A record names only what it knows; the rest stays, the
 * context's capacity too when a source that does not know it reports what it holds. A
 * record of the model alone, as Antigravity's hooks give, keeps a clock of its own, so it
 * never turns away an older snapshot of the tokens and quotas that arrives after it.
 */
export const observeTelemetry = (
  telemetry: Telemetry | null,
  binding: Binding,
  event: TelemetryObserved,
): Telemetry | undefined => {
  if (!bound(binding, event)) return undefined
  const naming = event.model !== undefined || event.effort !== undefined
  const modelOnly = naming && event.context === undefined && event.limits === undefined
  const usageAt = telemetry?.at ?? Number.NEGATIVE_INFINITY
  const modelAt = telemetry?.modelAt ?? Number.NEGATIVE_INFINITY
  const freshUsage = !modelOnly && event.startedAt >= usageAt
  const freshModel = naming && event.startedAt >= modelAt
  // A record older than the tokens and quotas shown may still name a newer model.
  if (!freshUsage && !freshModel) return undefined
  return {
    context: !freshUsage
      ? (telemetry?.context ?? null)
      : event.context === undefined
        ? (telemetry?.context ?? null)
        : event.context && event.context.capacity === null && telemetry?.context?.capacity
          ? { ...event.context, capacity: telemetry.context.capacity }
          : event.context,
    limits: (freshUsage && event.limits) || (telemetry?.limits ?? []),
    model: freshModel && event.model !== undefined ? event.model : (telemetry?.model ?? null),
    effort: freshModel && event.effort !== undefined ? event.effort : (telemetry?.effort ?? null),
    at: freshUsage ? event.startedAt : usageAt,
    modelAt: freshModel ? event.startedAt : modelAt,
  }
}

/** The telemetry as clients see it. */
export const telemetrySummary = ({
  context,
  limits,
  model,
  effort,
}: Telemetry): AgentTelemetry => ({
  context,
  limits,
  model,
  effort,
})

type Window = AgentTelemetry["limits"][number]

/**
 * The usage-limit window the last turn ran into, or null: the turn was not interrupted and
 * has none yet, and either its harness said it failed on a limit or some window with a
 * reset to come (after the turn ended) is used up. Of the used-up windows the one that
 * resets last, as nothing runs before it does; a harness's word with no window used up
 * takes the most-used one. Latch it on the turn (`withLimit`): it stays after the window's
 * records move on.
 */
export const limitOf = (
  lastTurn: LastTurn | null,
  limits: readonly Window[],
): { minutes: number | null; resetsAt: number } | null => {
  if (!lastTurn || lastTurn.outcome === "interrupted" || lastTurn.limit) return null
  const ahead = limits.filter(
    (window): window is Window & { resetsAt: number } =>
      window.resetsAt !== null && window.resetsAt > lastTurn.at,
  )
  const spent = ahead.filter(({ used }) => used >= 1)
  const pick =
    spent.length > 0
      ? spent.reduce((a, b) => (b.resetsAt > a.resetsAt ? b : a))
      : lastTurn.limited
        ? ahead.reduce<(Window & { resetsAt: number }) | null>(
            (a, b) => (!a || b.used > a.used ? b : a),
            null,
          )
        : null
  return pick && { minutes: pick.minutes, resetsAt: pick.resetsAt }
}
