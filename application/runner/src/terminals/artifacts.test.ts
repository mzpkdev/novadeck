import { describe, expect, it } from "../test.js"
import { artifactsNotice } from "./artifacts.js"

describe("the notice of the bar beside a terminal", () => {
  it("is one paragraph worded as Novadeck's automatic notice, saying what to show and what not to", () => {
    expect(artifactsNotice).toMatch(/^Novadeck: automatic notice, not from the user: /)
    expect(artifactsNotice).not.toContain("\n")
    for (const word of [
      "show tool",
      "deliverable",
      "not each file you touch",
      "diff",
      "open",
      "close",
    ])
      expect(artifactsNotice).toContain(word)
  })
})
