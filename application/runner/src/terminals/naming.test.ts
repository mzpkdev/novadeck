import { describe, expect, it } from "../test.js"
import {
  defaultTitle,
  murmured,
  openedWith,
  renamed,
  summaryOf,
  titleOf,
  unnamed,
  type Naming,
} from "./naming.js"

const terminal = { handle: "t3" }
const agent = { title: "Login fix", by: "t1" }
const murmur = { title: "Fixing login", summary: "Fixes the login bug." }

describe("a terminal's title", () => {
  it("is the person's, then murmur's, then the opening agent's, then the default", () => {
    const named: Naming = { person: "Mine", agent, murmur }
    expect(titleOf(named, terminal)).toEqual({
      title: "Mine",
      source: { kind: "person" },
    })
    expect(titleOf({ ...named, person: null }, terminal)).toEqual({
      title: "Fixing login",
      source: { kind: "murmur" },
    })
    expect(titleOf({ ...named, person: null, murmur: null }, terminal)).toEqual({
      title: "Login fix",
      source: { kind: "agent", by: "t1" },
    })
    expect(titleOf(unnamed, terminal)).toEqual({
      title: "Terminal 03",
      source: { kind: "default" },
    })
  })

  it("is the session's default by its handle's number", () => {
    expect(defaultTitle("t3")).toBe("Terminal 03")
    expect(defaultTitle("t104")).toBe("Terminal 104")
    expect(titleOf(unnamed, { handle: "t12" }).title).toBe("Terminal 12")
  })
})

describe("naming a terminal", () => {
  it("gives the person's title, or takes it away so the title is automatic again", () => {
    const theirs = renamed({ ...unnamed, agent, murmur }, "Mine")
    expect(titleOf(theirs, terminal).title).toBe("Mine")
    // The other layers stay beneath theirs.
    expect(titleOf(renamed(theirs, null), terminal).source).toEqual({
      kind: "murmur",
    })
    expect(renamed(theirs, null).agent).toEqual(agent)
  })

  it("takes the title an opener asked for as that agent's, beneath murmur's and the person's", () => {
    expect(openedWith(unnamed, "Server", "t1")).toEqual({
      ...unnamed,
      agent: { title: "Server", by: "t1" },
    })
    const opened = openedWith(murmured(unnamed, murmur), "Server", "t1")
    expect(titleOf(opened, terminal).title).toBe("Fixing login")
    expect(openedWith(renamed(unnamed, "Mine"), "Server", "t1").person).toBe("Mine")
  })

  it("keeps the opening agent's title as it is while murmur describes, and replaces murmur's each time", () => {
    const first = murmured(openedWith(unnamed, "Server", "t1"), murmur)
    expect(first.agent).toEqual({ title: "Server", by: "t1" })
    const next = murmured(first, {
      title: "Fixing signup",
      summary: "Fixes signup.",
    })
    expect(next.murmur).toEqual({
      title: "Fixing signup",
      summary: "Fixes signup.",
    })
    expect(next.agent).toEqual(first.agent)
  })

  it("lists only murmur's summary", () => {
    expect(summaryOf(unnamed)).toBeNull()
    expect(summaryOf({ ...unnamed, agent })).toBeNull()
    expect(summaryOf({ ...unnamed, murmur })).toBe("Fixes the login bug.")
  })
})
