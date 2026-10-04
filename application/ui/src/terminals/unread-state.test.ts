import { describe, expect, it } from "../test"
import {
  clearUnread,
  isUnread,
  keepUnread,
  markUnread,
  noUnread,
  viewUnread,
  type Viewing,
} from "./unread-state"

const here = "project/initial"
const there = "project/other"

describe("unread replies", () => {
  it("marks a terminal whose agent finished while the person looked elsewhere", () => {
    const unread = markUnread(noUnread, here, "02", { context: here, id: "01" })
    expect(isUnread(unread, here, "02")).toBe(true)
    expect(isUnread(unread, here, "01")).toBe(false)
    expect(isUnread(unread, there, "02")).toBe(false)
  })

  it("marks one that finished while the page had no focus", () => {
    expect(isUnread(markUnread(noUnread, here, "01", null), here, "01")).toBe(true)
  })

  it("leaves one the person was looking at as it finished", () => {
    expect(markUnread(noUnread, here, "01", { context: here, id: "01" })).toBe(noUnread)
  })

  it("marks a terminal once, however often it finishes", () => {
    const once = markUnread(noUnread, here, "02", null)
    expect(markUnread(once, here, "02", null)).toBe(once)
  })

  it("clears once the person looks at it, and only that terminal", () => {
    const unread = markUnread(markUnread(noUnread, here, "01", null), here, "02", null)
    const viewing: Viewing = { context: here, id: "02" }
    const viewed = viewUnread(unread, viewing)
    expect(isUnread(viewed, here, "02")).toBe(false)
    expect(isUnread(viewed, here, "01")).toBe(true)
    expect(viewUnread(viewed, viewing)).toBe(viewed)
    expect(viewUnread(viewed, null)).toBe(viewed)
  })

  it("clears its session's entry with its last terminal", () => {
    expect(clearUnread(markUnread(noUnread, there, "03", null), there, "03")).toEqual({})
  })

  it("forgets terminals that are gone", () => {
    const unread = markUnread(markUnread(noUnread, here, "01", null), there, "03", null)
    expect(keepUnread(unread, (context) => context === here)).toEqual({ [here]: ["01"] })
    expect(keepUnread(unread, () => true)).toBe(unread)
  })
})
