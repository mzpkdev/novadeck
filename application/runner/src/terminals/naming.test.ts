import { describe, expect, it } from "../test.js"
import {
  cleanSummary,
  defaultTitle,
  descriptionRefusal,
  fallbackChars,
  fallbackTitle,
  titleOf,
  unnamed,
} from "./naming.js"
import { freshWork, type Work } from "./work.js"

const work = (first: string | null): Work => ({ ...freshWork("claude:s1"), first, latest: first })

describe("a terminal's title", () => {
  it("is the person's, then the agent that set it last, then the first prompt, then the default", () => {
    const prompted = work("Fix the login bug")
    const agent = { title: "Login fix", by: "t1" }
    expect(titleOf({ ...unnamed, person: "Mine", agent }, prompted, "t3")).toEqual({
      title: "Mine",
      source: { kind: "person" },
    })
    expect(titleOf({ ...unnamed, agent }, prompted, "t3")).toEqual({
      title: "Login fix",
      source: { kind: "agent", by: "t1" },
    })
    expect(titleOf(unnamed, prompted, "t3")).toEqual({
      title: "Fix the login bug",
      source: { kind: "fallback" },
    })
    expect(titleOf(unnamed, work(null), "t3")).toEqual({
      title: "Terminal 03",
      source: { kind: "default" },
    })
    expect(titleOf(unnamed, null, "t12").title).toBe("Terminal 12")
  })

  it("takes the person's title back to automatic once theirs is taken away", () => {
    const naming = { ...unnamed, person: "Mine", agent: { title: "Login fix", by: "t3" } }
    expect(titleOf({ ...naming, person: null }, work("Fix it"), "t3")).toEqual({
      title: "Login fix",
      source: { kind: "agent", by: "t3" },
    })
  })

  it("is the session's default by its handle's number", () => {
    expect(defaultTitle("t3")).toBe("Terminal 03")
    expect(defaultTitle("t104")).toBe("Terminal 104")
  })
})

describe("the title from the person's first prompt", () => {
  it("is that prompt on one line, shortened", () => {
    expect(fallbackTitle(work("  Fix the\n\tlogin   bug  "))).toBe("Fix the login bug")
    const long = fallbackTitle(work(`Refactor ${"the payment flow ".repeat(10)}`))
    expect(long).toMatch(/^Refactor the payment flow .*…$/)
    expect(long!.length).toBeLessThanOrEqual(fallbackChars)
  })

  it("is none before the person's first prompt, or when nothing of it is left", () => {
    expect(fallbackTitle(null)).toBeNull()
    expect(fallbackTitle(work(null))).toBeNull()
    expect(fallbackTitle(work("\u0007\u001b"))).toBeNull()
  })
})

describe("a description", () => {
  it("keeps a summary to its lines, each on one line of its own", () => {
    expect(cleanSummary("  Builds the\tusers API.\n\n  Then paging. \u001b ")).toBe(
      "Builds the users API.\nThen paging.",
    )
  })

  it("takes a one-line title and a summary of a line or two, up to 200 characters", () => {
    expect(descriptionRefusal("Users API", "Builds the users API.")).toBeUndefined()
    expect(descriptionRefusal("Users\nAPI", "Builds it.")).toMatch(/^The title must be one line/)
    expect(descriptionRefusal("", "Builds it.")).toMatch(/^The title must be one line/)
    expect(descriptionRefusal("Users API", "")).toMatch(/^The summary is empty/)
    expect(descriptionRefusal("Users API", "a\nb\nc")).toMatch(/keep it to 2 lines/)
    expect(descriptionRefusal("Users API", "x".repeat(201))).toMatch(/200 characters/)
  })
})
