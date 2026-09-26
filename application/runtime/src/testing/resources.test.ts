import { context, describe, expect, it } from "../test.js"
import { Resources } from "./resources.js"

describe("per-test resource ownership", () => {
  context("when cleanup fails", () => {
    it("still releases every resource in reverse order and reports every failure", async () => {
      const resources = new Resources()
      const closed: string[] = []
      const first = new Error("first")
      const second = new Error("second")
      resources.defer(() => {
        closed.push("directory")
      })
      resources.defer(() => {
        closed.push("runtime")
        throw first
      })
      resources.defer(async () => {
        closed.push("socket")
        throw second
      })
      await expect(resources.dispose()).rejects.toMatchObject({ errors: [second, first] })
      expect(closed).toEqual(["socket", "runtime", "directory"])
      await expect(resources.dispose()).resolves.toBeUndefined()
      expect(closed).toHaveLength(3)
    })
  })

  it("keeps independently owned resources isolated", async () => {
    const first = new Resources()
    const second = new Resources()
    const closed: string[] = []
    first.defer(() => {
      closed.push("first")
    })
    second.defer(() => {
      closed.push("second")
    })
    await first.dispose()
    expect(closed).toEqual(["first"])
    await second.dispose()
    expect(closed).toEqual(["first", "second"])
  })
})
