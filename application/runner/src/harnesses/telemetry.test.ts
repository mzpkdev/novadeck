import type { TelemetryObserved } from "@novadeck/harness-core/events"

import { describe, expect, it } from "../test.js"
import type { LastTurn } from "./activity.js"
import type { Binding } from "./bindings.js"
import {
  limitGraceMs,
  limitOf as limitIn,
  observeTelemetry,
  telemetrySummary,
} from "./telemetry.js"

const binding: Binding = { agent: "codex", sessionId: "s", instance: null }
const seen = (fields: Partial<TelemetryObserved>): TelemetryObserved => ({
  type: "telemetry-observed",
  agent: "codex",
  sessionId: "s",
  instance: null,
  startedAt: 10,
  ...fields,
})
const context = { occupied: 1_000, capacity: 200_000 }
const limit = { minutes: 300, used: 0.25, resetsAt: 5_000 }

describe("observing telemetry", () => {
  it("keeps what a later record leaves out", () => {
    const first = observeTelemetry(null, binding, seen({ context, limits: [limit] }))!
    const next = observeTelemetry(
      first,
      binding,
      seen({ startedAt: 11, context: { ...context, occupied: 2_000 } }),
    )
    expect(next).toMatchObject({ context: { occupied: 2_000 }, limits: [limit] })
  })

  it("keeps a known capacity when a source that does not know it reports", () => {
    const first = observeTelemetry(null, binding, seen({ context }))!
    const next = observeTelemetry(
      first,
      binding,
      seen({ startedAt: 11, context: { occupied: 5_000, capacity: null } }),
    )
    expect(next?.context).toEqual({ occupied: 5_000, capacity: 200_000 })
  })

  it("takes an older snapshot of the context after a newer record of the model alone", () => {
    // Antigravity's hooks name the model; its status line snapshot may arrive after.
    const named = observeTelemetry(null, binding, seen({ startedAt: 200, model: "gemini" }))!
    const snapshot = observeTelemetry(named, binding, seen({ startedAt: 150, context }))
    expect(snapshot).toMatchObject({ model: "gemini", context })
    // A usage record older than the tokens shown still brings a newer model, as Claude
    // Code's status line can after a /model while its transcript's usage was read.
    const later = observeTelemetry(snapshot!, binding, seen({ startedAt: 300, context }))!
    expect(
      observeTelemetry(later, binding, seen({ startedAt: 250, context, model: "next" })),
    ).toMatchObject({ model: "next", at: 300 })
    // An older record of the model alone still gives way to the newer one.
    expect(observeTelemetry(snapshot!, binding, seen({ startedAt: 180, model: "old" }))).toBe(
      undefined,
    )
  })

  it("keeps the known model and effort when a record names neither, and takes a new one", () => {
    const first = observeTelemetry(null, binding, seen({ model: "gpt-6", effort: "high" }))!
    const next = observeTelemetry(first, binding, seen({ startedAt: 11, context }))!
    expect(next).toMatchObject({ model: "gpt-6", effort: "high" })
    const changed = observeTelemetry(next, binding, seen({ startedAt: 12, model: "gpt-7" }))!
    expect(changed).toMatchObject({ model: "gpt-7", effort: "high" })
    expect(telemetrySummary(changed)).toEqual({
      context,
      limits: [],
      model: "gpt-7",
      effort: "high",
    })
    expect(observeTelemetry(null, binding, seen({ context }))).toMatchObject({
      model: null,
      effort: null,
    })
  })

  it("ignores an older record, and another session's", () => {
    const first = observeTelemetry(null, binding, seen({ context }))!
    expect(
      observeTelemetry(first, binding, seen({ startedAt: 9, limits: [limit] })),
    ).toBeUndefined()
    expect(
      observeTelemetry(first, binding, seen({ sessionId: "t", limits: [limit] })),
    ).toBeUndefined()
  })
})

describe("the limit a turn ran into", () => {
  // Seen as the turn ended, unless a case says when.
  const limitOf = (
    lastTurn: LastTurn | null,
    limits: Parameters<typeof limitIn>[1],
    seenAt = 1_000,
  ) => limitIn(lastTurn, limits, seenAt)

  const turn = (fields: Partial<LastTurn> = {}): LastTurn => ({
    outcome: "completed",
    reply: null,
    at: 1_000,
    recorded: false,
    files: [],
    ...fields,
  })
  const window = (minutes: number | null, used: number, resetsAt: number | null) => ({
    minutes,
    used,
    resetsAt,
  })

  it("takes a window used up, as the turn ended or since", () => {
    expect(limitOf(turn(), [window(300, 0.4, 5_000), window(10_080, 1, 9_000)])).toEqual({
      minutes: 10_080,
      resetsAt: 9_000,
    })
  })

  it("takes the one that resets last of several used up", () => {
    expect(limitOf(turn(), [window(300, 1, 5_000), window(10_080, 1, 9_000)])).toEqual({
      minutes: 10_080,
      resetsAt: 9_000,
    })
  })

  it("takes the most-used window when its harness said the turn hit a limit and none shows used up", () => {
    const limited = turn({ outcome: "failed", limited: true })
    expect(limitOf(limited, [window(300, 0.4, 5_000), window(10_080, 0.9, 9_000)])).toEqual({
      minutes: 10_080,
      resetsAt: 9_000,
    })
    expect(limitOf(turn({ outcome: "failed" }), [window(300, 0.4, 5_000)])).toBeNull()
  })

  it("takes none for a window with no reset to come, or an interrupted turn", () => {
    expect(limitOf(turn(), [window(300, 1, null)])).toBeNull()
    expect(limitOf(turn(), [window(300, 1, 900)])).toBeNull()
    expect(
      limitOf(turn({ outcome: "interrupted", limited: true }), [window(300, 1, 5_000)]),
    ).toBeNull()
    expect(limitOf(turn({ limited: true }), [])).toBeNull()
    expect(limitOf(null, [window(300, 1, 5_000)])).toBeNull()
  })

  it("takes a window used up seen within the grace after the turn, not one that fills later", () => {
    const full = [window(300, 1, 900_000)]
    expect(limitOf(turn(), full, 1_000 + limitGraceMs)).toEqual({ minutes: 300, resetsAt: 900_000 })
    expect(limitOf(turn(), full, 1_000 + limitGraceMs + 1)).toBeNull()
    expect(limitOf(turn({ outcome: "failed" }), full, 1_000 + limitGraceMs + 1)).toBeNull()
  })

  it("takes the harness's word on a limit whenever the records come", () => {
    const full = [window(300, 1, 900_000)]
    expect(limitOf(turn({ outcome: "failed", limited: true }), full, 99_000_000)).toEqual({
      minutes: 300,
      resetsAt: 900_000,
    })
  })

  it("keeps the window it latched whatever the records say after", () => {
    expect(
      limitOf(turn({ limit: { minutes: 300, resetsAt: 5_000 } }), [window(300, 1, 9_000)]),
    ).toBeNull()
  })
})
