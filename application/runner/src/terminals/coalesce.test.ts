import { setImmediate as tick } from "node:timers/promises"

import { describe, expect, it } from "../test.js"
import { coalesced } from "./coalesce.js"

describe("coalesced changes", () => {
  it("run once per key per tick, however many changes came", async () => {
    const runs: string[] = []
    const changed = coalesced((key) => runs.push(key))
    for (let index = 0; index < 100; index++) changed("a")
    changed("b")
    changed("b")
    expect(runs).toEqual([])
    await tick()
    expect(runs.toSorted()).toEqual(["a", "b"])
    changed("a")
    await tick()
    expect(runs).toHaveLength(3)
  })
})
