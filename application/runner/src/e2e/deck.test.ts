import { describe, expect, it } from "../test.js"
import { occurrences } from "./deck.js"

describe("occurrences", () => {
  it("counts a text each time the screen shows it", () => {
    expect(occurrences("Allow? Yes\nAllow? Yes", "Allow?")).toBe(2)
    expect(occurrences("Nothing here", "Allow?")).toBe(0)
  })

  it("counts every match of a pattern, global or not", () => {
    expect(occurrences("Allow? Yes\nallow? No", /allow\?/i)).toBe(2)
    expect(occurrences("Allow? Yes\nAllow? No", /Allow\?/g)).toBe(2)
  })
})
