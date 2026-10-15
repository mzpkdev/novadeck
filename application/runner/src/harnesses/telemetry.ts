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
 * How long after a turn ended a record showing a window used up still counts as the turn
 * running into it. A window that fills later is the person's, not the turn's: it latches
 * nothing on a terminal idle since.
 */
export const limitGraceMs = 60_000

/**
 * The usage-limit window the last turn ran into, or null. Only records made (`seenAt`) by
 * the turn's end or within `limitGraceMs` after it count, and the turn was not interrupted
 * and has no window yet. Of the windows with a reset to come after the turn ended: a
 * `failed` or `unknown` turn takes the used-up one that resets last, as nothing runs before
 * it does; a `completed` turn takes none on its own, as a bucket filling beside it (as
 * Antigravity's does) is no limit it ran into. Where its harness said it failed on a limit
 * (`limited`), and no window shows used up, the most-used one. Latch it on the turn
 * (`withLimit`): it stays after the window's records move on.
 */
export const limitOf = (
  lastTurn: LastTurn | null,
  limits: readonly Window[],
  seenAt: number,
): { minutes: number | null; resetsAt: number } | null => {
  if (!lastTurn || lastTurn.outcome === "interrupted" || lastTurn.limit) return null
  if (seenAt > lastTurn.at + limitGraceMs) return null
  const ahead = limits.filter(
    (window): window is Window & { resetsAt: number } =>
      window.resetsAt !== null && window.resetsAt > lastTurn.at,
  )
  const spent =
    lastTurn.outcome === "completed" && !lastTurn.limited
      ? []
      : ahead.filter(({ used }) => used >= 1)
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
