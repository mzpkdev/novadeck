import { describe, expect, it } from "vitest"

import { done, hints, noticed, type Seen, type Signals } from "./visitor-hints"

const quiet: Signals = {
  answered: false,
  view: "focus",
  companion: false,
  project: "storefront",
  first: "storefront",
}
const hint = (id: string) => hints.find((each) => each.id === id)!

describe("the visitor's things to try", () => {
  it("notices nothing while the person has done nothing", () => {
    expect(noticed(new Set(), quiet).size).toBe(0)
  })

  it("keeps what was seen after it no longer shows", () => {
    const seen = noticed(new Set(), { ...quiet, view: "grid" })

    expect(noticed(seen, quiet).has("grid")).toBe(true)
  })

  it("is done with the views only once both Grid and Canvas were seen", () => {
    const grid = noticed(new Set(), { ...quiet, view: "grid" })
    const both = noticed(grid, { ...quiet, view: "canvas" })

    expect(done(hint("views"), grid)).toBe(false)
    expect(done(hint("views"), both)).toBe(true)
  })

  it("sees an answer, an open pane and another project", () => {
    const seen: ReadonlySet<Seen> = noticed(new Set(), {
      answered: true,
      view: "focus",
      companion: true,
      project: "infra",
      first: "storefront",
    })

    expect(["answer", "companion", "project"].every((id) => done(hint(id), seen))).toBe(true)
  })
})
