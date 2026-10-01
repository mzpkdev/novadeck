import { describe, expect, it } from "../test.js"
import {
  backstopPrompts,
  described,
  drifted,
  fired,
  noNudges,
  nudgeText,
  personPrompted,
  take,
  type Facts,
  type Nudges,
} from "./nudges.js"

const facts: Facts = { plan: "Pagination", folder: "/w/src/api", branch: "feat/paging" }

/** Whether the next quiet prompt nudges, and the nudges after it. */
const quietly = (nudges: Nudges) => take(nudges, true)

describe("nudges to describe a terminal", () => {
  it("add nothing while no trigger fired", () => {
    expect(quietly(noNudges)).toEqual({ nudge: false, nudges: noNudges })
    expect(quietly(personPrompted(described(facts)))).toMatchObject({ nudge: false })
  })

  it("nudge once for each trigger, then wait for the next", () => {
    for (const trigger of ["session", "compaction", "drift", "prompts"] as const) {
      const first = quietly(fired(noNudges, trigger))
      expect(first.nudge).toBe(true)
      // Ignored: nothing more until another trigger fires.
      expect(quietly(first.nudges).nudge).toBe(false)
      expect(quietly(fired(first.nudges, trigger)).nudge).toBe(true)
    }
    // Triggers that fire together nudge once.
    const both = quietly(fired(fired(noNudges, "session"), "compaction"))
    expect(both.nudge).toBe(true)
    expect(quietly(both.nudges).nudge).toBe(false)
  })

  it("never ride along with messages: the trigger waits for an answer that has nothing else", () => {
    const pending = fired(noNudges, "session")
    const busy = take(pending, false)
    expect(busy).toEqual({ nudge: false, nudges: pending })
    expect(quietly(busy.nudges).nudge).toBe(true)
  })

  it("are cleared by a describe, which drift is then measured from", () => {
    const after = described(facts)
    expect(after).toEqual({ pending: [], prompts: 0, baseline: facts })
    expect(quietly(drifted(after, facts)).nudge).toBe(false)
  })

  it("nudge once when the plan, the main folder or the branch drifts from the last describe", () => {
    for (const change of [
      { plan: "Caching" },
      { folder: "/w/web" },
      { branch: "main" },
    ] satisfies Partial<Facts>[]) {
      const moved = { ...facts, ...change }
      const once = quietly(drifted(described(facts), moved))
      expect(once.nudge).toBe(true)
      // The same drift never fires again; a further one does.
      expect(quietly(drifted(once.nudges, moved)).nudge).toBe(false)
      expect(quietly(drifted(once.nudges, { ...moved, branch: "other" })).nudge).toBe(true)
    }
    // Before any describe there is nothing to drift from.
    expect(quietly(drifted(noNudges, facts)).nudge).toBe(false)
  })

  it("nudge as a backstop after enough of the person's prompts since the last describe", () => {
    let nudges = described(facts)
    for (let count = 1; count < backstopPrompts; count += 1) nudges = personPrompted(nudges)
    expect(quietly(nudges).nudge).toBe(false)
    nudges = personPrompted(nudges)
    const backstop = quietly(nudges)
    expect(backstop.nudge).toBe(true)
    // Ignored, it waits for as many prompts again.
    nudges = backstop.nudges
    for (let count = 1; count < backstopPrompts; count += 1) nudges = personPrompted(nudges)
    expect(quietly(nudges).nudge).toBe(false)
    expect(quietly(personPrompted(nudges)).nudge).toBe(true)
  })
})

describe("a nudge", () => {
  it("asks for a description while there is none, as one line of NovaDeck's notice", () => {
    const text = nudgeText({ title: "Terminal 01", summary: null })
    expect(text).toMatch(/^NovaDeck: automatic notice, not from the user: this terminal has no/)
    expect(text).toContain("describe tool")
    expect(text).not.toContain("\n")
    expect(text).not.toContain("asked")
  })

  it("shows the current description later, to update only if it no longer fits", () => {
    const text = nudgeText({ title: "Users API", summary: "Builds the users API.\nThen paging." })
    expect(text).toBe(
      'NovaDeck: automatic notice, not from the user: this terminal is described as "Users API", ' +
        'with the summary "Builds the users API. Then paging."; if that no longer fits your work, ' +
        "update it with NovaDeck's describe tool, and otherwise this notice can be ignored.",
    )
  })
})
