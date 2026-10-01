import { describe, expect, it } from "../test.js"
import {
  continues,
  maxContinuations,
  route,
  transition,
  unbound,
  type Delivery,
  type DeliveryEvent,
} from "./delivery.js"

const bound = transition(unbound, { type: "bound" })
const run = (from: Delivery, ...events: DeliveryEvent[]): Delivery =>
  events.reduce(transition, from)

const person = { type: "prompt", by: "person" } as const
const harness = { type: "prompt", by: "harness" } as const
const call = { type: "prompt", by: "call" } as const
const stop = { type: "stop", continued: false, background: false } as const
const continued = { type: "stop", continued: true, background: false } as const
const background = { type: "stop", continued: false, background: true } as const
const ended = { type: "ended" } as const
const typing = { type: "input", submits: false, answers: false } as const
const enter = { type: "input", submits: true, answers: false } as const
const answer = { type: "input", submits: true, answers: true } as const

const working = run(bound, person)
const settled = run(working, stop)
const busy = run(settled, typing)
const unknown = run(working, ended)

describe("a terminal's delivery state", () => {
  it("is Fresh once a session binds, with its prompt known empty", () => {
    expect(bound).toEqual({ state: "fresh", empty: true, submitted: false, continued: 0 })
  })

  it("is Unbound in every bound state once the binding ends", () => {
    for (const from of [bound, working, settled, busy, unknown])
      expect(transition(from, { type: "unbound" }).state).toBe("unbound")
  })

  it("is Fresh again in every bound state once its harness announces a new session", () => {
    for (const from of [working, settled, busy, unknown])
      expect(transition(from, { type: "bound" })).toEqual(bound)
  })

  it("works from Fresh, Settled, Person busy and Unknown once a root prompt starts a turn", () => {
    for (const from of [bound, settled, busy, unknown])
      expect(transition(from, person)).toMatchObject({ state: "working", continued: 0 })
  })

  it("settles at a normal root Stop not continued, the prompt known empty", () => {
    expect(settled).toMatchObject({ state: "settled", empty: true, continued: 0 })
  })

  it("leaves the person busy at a Stop when the prompt isn't known empty", () => {
    expect(run(working, typing, stop).state).toBe("busy")
    // A turn the harness started by itself proves nothing about the prompt.
    expect(run(busy, harness, stop).state).toBe("busy")
  })

  it("leaves the person busy at a Stop once they submitted during the turn", () => {
    const queued = run(working, enter)
    expect(queued).toMatchObject({ state: "working", submitted: true })
    expect(continues(queued)).toBe(false)
    expect(transition(queued, stop).state).toBe("busy")
  })

  it("keeps working through a Stop NovaDeck continued, counting it", () => {
    const once = transition(working, continued)
    expect(once).toMatchObject({ state: "working", continued: 1 })
    expect(continues(once)).toBe(true)
    const limit = run(working, ...Array.from({ length: maxContinuations }, () => continued))
    expect(continues(limit)).toBe(false)
    // A later call of the same turn keeps the count.
    expect(run(limit, call, person).continued).toBe(maxContinuations)
    expect(transition(limit, stop).state).toBe("settled")
  })

  it("keeps working while what the turn started still runs, until a later Stop", () => {
    const waiting = transition(working, background)
    expect(waiting).toMatchObject({ state: "working", continued: 0 })
    expect(run(waiting, harness, stop).state).toBe("settled")
  })

  it("is Unknown after an abnormal end", () => {
    expect(unknown).toMatchObject({ state: "unknown", continued: 0 })
    // A Stop that arrives anyway, as a status line's idle raced it, ends the turn.
    expect(transition(unknown, stop).state).toBe("settled")
  })

  it("leaves Settled for Person busy at the person's input, but not at an answer", () => {
    expect(busy).toMatchObject({ state: "busy", empty: false })
    expect(transition(settled, answer)).toEqual(settled)
    // An answer to a request during the turn is no submission either.
    expect(run(working, answer, stop).state).toBe("settled")
  })

  it("makes the prompt known empty again at the person's own prompt only", () => {
    expect(run(busy, person).empty).toBe(true)
    expect(run(busy, harness).empty).toBe(false)
    expect(run(busy, call).empty).toBe(false)
  })

  it("ignores everything but a binding while Unbound", () => {
    for (const event of [person, stop, ended, enter])
      expect(transition(unbound, event)).toBe(unbound)
  })

  it("ignores a Stop with no turn to end", () => {
    expect(transition(settled, stop)).toEqual(settled)
    expect(transition(busy, continued)).toEqual(busy)
  })
})

describe("when a message would reach an agent", () => {
  it("says so in send's words for each state", () => {
    expect(route(bound, false)).toBe("when its agent first prompts")
    expect(route(working, false)).toBe("when its current turn ends")
    // Codex sends nothing when a turn fails.
    expect(route(working, true)).toBe("at its turn's end or its next prompt")
    for (const state of [settled, busy, unknown])
      expect(route(state, false)).toBe("when the person next submits a prompt there")
  })
})
