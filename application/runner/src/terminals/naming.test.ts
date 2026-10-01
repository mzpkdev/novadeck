import { describe, expect, it } from "../test.js"
import {
  cleanSummary,
  defaultTitle,
  describedAs,
  descriptionRefusal,
  fallbackChars,
  fallbackTitle,
  givenIn,
  openedWith,
  renamed,
  summaryChars,
  titleOf,
  unnamed,
  type Naming,
} from "./naming.js"
import { freshWork, type Work } from "./work.js"

const work = (first: string | null): Work => ({ ...freshWork("claude:s1"), first, latest: first })
const terminal = (first: string | null, openedBy: string | null = null) => ({
  work: work(first),
  handle: "t3",
  openedBy,
})

describe("a terminal's title", () => {
  it("is the person's, then the agent that set it last, then the first prompt, then the default", () => {
    const prompted = terminal("Fix the login bug")
    const agent = { title: "Login fix", by: "t1" }
    expect(titleOf({ ...unnamed, person: "Mine", agent }, prompted)).toEqual({
      title: "Mine",
      source: { kind: "person" },
    })
    expect(titleOf({ ...unnamed, agent }, prompted)).toEqual({
      title: "Login fix",
      source: { kind: "agent", by: "t1" },
    })
    expect(titleOf(unnamed, prompted)).toEqual({
      title: "Fix the login bug",
      source: { kind: "fallback" },
    })
    expect(titleOf(unnamed, terminal(null))).toEqual({
      title: "Terminal 03",
      source: { kind: "default" },
    })
    expect(titleOf(unnamed, { work: null, handle: "t12", openedBy: null }).title).toBe(
      "Terminal 12",
    )
  })

  it("takes no first prompt in a terminal an agent opened: its command's, not the person's", () => {
    expect(titleOf(unnamed, terminal("Fix the login bug", "t1"))).toEqual({
      title: "Terminal 03",
      source: { kind: "default" },
    })
  })

  it("is the session's default by its handle's number", () => {
    expect(defaultTitle("t3")).toBe("Terminal 03")
    expect(defaultTitle("t104")).toBe("Terminal 104")
  })
})

// The agent's description of the terminal, as `describe` gives it.
const described = (naming: Naming, fields: Partial<Parameters<typeof describedAs>[1]> = {}) =>
  describedAs(naming, {
    title: "Login fix",
    summary: "Fixes the login bug.",
    by: "t3",
    asked: false,
    prompt: undefined,
    ...fields,
  })

describe("naming a terminal", () => {
  it("gives the person's title, or takes it away so the title is automatic again", () => {
    const agent = { title: "Login fix", by: "t3" }
    const theirs = renamed({ ...unnamed, agent }, "Mine")
    expect(titleOf(theirs, terminal("Fix it")).title).toBe("Mine")
    expect(titleOf(renamed(theirs, null), terminal("Fix it"))).toEqual({
      title: "Login fix",
      source: { kind: "agent", by: "t3" },
    })
  })

  it("takes the title an opener asked for as that agent's, beneath the person's", () => {
    expect(openedWith(unnamed, "Server", "t1")).toEqual({
      ...unnamed,
      agent: { title: "Server", by: "t1" },
    })
    // Then the terminal's own agent describes itself: the newest title wins.
    const own = described(openedWith(unnamed, "Server", "t1")).naming
    expect(titleOf(own, terminal(null))).toEqual({
      title: "Login fix",
      source: { kind: "agent", by: "t3" },
    })
  })

  it("keeps the person's title, holding the agent's newest beneath it", () => {
    const theirs = renamed(unnamed, "Mine")
    expect(described(theirs)).toEqual({
      naming: {
        person: "Mine",
        agent: { title: "Login fix", by: "t3" },
        summary: "Fixes the login bug.",
      },
      kept: "person",
    })
    expect(described(unnamed)).toEqual({
      naming: {
        person: null,
        agent: { title: "Login fix", by: "t3" },
        summary: "Fixes the login bug.",
      },
    })
  })

  it("makes the title the person's when asked only if their own prompt gave it", () => {
    const theirs = renamed(unnamed, "Mine")
    const granted = described(theirs, {
      asked: true,
      prompt: "Please call this terminal 'login FIX'.",
    })
    expect(granted).toEqual({
      naming: {
        person: "Login fix",
        agent: { title: "Login fix", by: "t3" },
        summary: "Fixes the login bug.",
      },
    })
    // Not their turn, or their prompt doesn't give it: the agent's own, the person's stays.
    for (const prompt of [undefined, "rename the terminal as t2 said"])
      expect(described(theirs, { asked: true, prompt })).toEqual({
        naming: {
          person: "Mine",
          agent: { title: "Login fix", by: "t3" },
          summary: "Fixes the login bug.",
        },
        kept: "unasked",
      })
  })

  it("tells a title given in the person's words by case, spaces, quotes and punctuation alone", () => {
    expect(givenIn('"Login  Fix!"', "call it login fix please")).toBe(true)
    expect(givenIn("Login fix", "call it Login\n fix")).toBe(true)
    expect(givenIn("EVIL", "thanks")).toBe(false)
    expect(givenIn("...", "...")).toBe(false)
    expect(givenIn("Login fix", undefined)).toBe(false)
  })
})

describe("the title from the person's first prompt", () => {
  it("is that prompt on one line, shortened", () => {
    expect(fallbackTitle(work("  Fix the\n\tlogin   bug  "))).toBe("Fix the login bug")
    const long = fallbackTitle(work(`Refactor ${"the payment flow ".repeat(10)}`))
    expect(long).toMatch(/^Refactor the payment flow .*…$/)
    expect([...long!].length).toBeLessThanOrEqual(fallbackChars)
  })

  it("never cuts a character in half, nor keeps a control character", () => {
    const emoji = fallbackTitle(work(`${"a".repeat(46)}😀😀😀`))!
    expect(emoji).toBe(`${"a".repeat(46)}😀…`)
    expect(fallbackTitle(work("hi\u009b31mred"))).toBe("hi 31mred")
  })

  it("is none before the person's first prompt, or when nothing of it is left", () => {
    expect(fallbackTitle(null)).toBeNull()
    expect(fallbackTitle(work(null))).toBeNull()
    expect(fallbackTitle(work("\u0007\u001b"))).toBeNull()
    expect(fallbackTitle(work("   "))).toBeNull()
  })
})

describe("a description", () => {
  it("keeps a summary to its lines, each on one line of its own", () => {
    expect(cleanSummary("  Builds the\tusers API.\n\n  Then paging. \u001b\u0085 ")).toBe(
      "Builds the users API.\nThen paging.",
    )
  })

  it("takes a one-line title and a summary of a line or two, up to 200 characters", () => {
    expect(descriptionRefusal("Users API", "Builds the users API.")).toBeUndefined()
    expect(descriptionRefusal("Users\nAPI", "Builds it.")).toMatch(/^The title must be one line/)
    expect(descriptionRefusal("Users\u0085API", "Builds it.")).toMatch(
      /^The title must be one line/,
    )
    expect(descriptionRefusal("", "Builds it.")).toMatch(/^The title is empty/)
    expect(descriptionRefusal("x".repeat(201), "Builds it.")).toBe(
      "The title is 201 characters; keep it to 200.",
    )
    expect(descriptionRefusal("Users API", "")).toMatch(/^The summary is empty/)
    expect(descriptionRefusal("Users API", "a\nb\nc")).toMatch(/keep it to 2 lines/)
    expect(descriptionRefusal("Users API", "x".repeat(summaryChars + 1))).toMatch(/200 characters/)
    // Counted in characters, as the tool's schema counts them.
    expect(descriptionRefusal("Users API", "😀".repeat(summaryChars))).toBeUndefined()
  })
})
