import { afterEach, vi } from "vitest"

import { describe, expect, it } from "../test"
import { clearUpdateRaised, readUpdateRaised, writeUpdateRaised } from "./update-raised"

afterEach(() => {
  vi.restoreAllMocks()
  clearUpdateRaised()
  localStorage.clear()
})

describe("the run the card was raised in", () => {
  it("is read back as written, and gone once cleared", () => {
    expect(readUpdateRaised("run-1")).toBe(false)
    writeUpdateRaised("run-1")
    expect(readUpdateRaised("run-1")).toBe(true)
    clearUpdateRaised()
    expect(readUpdateRaised("run-1")).toBe(false)
  })

  it("is read back by a window opened again within the run, but not by another launch", () => {
    writeUpdateRaised("run-1")
    // A window opened again has its own session storage and an empty page, not another run.
    sessionStorage.clear()
    expect(readUpdateRaised("run-1")).toBe(true)
    expect(readUpdateRaised("run-2")).toBe(false)
  })

  it("is replaced by the card of the next launch", () => {
    writeUpdateRaised("run-1")
    writeUpdateRaised("run-2")
    expect(readUpdateRaised("run-1")).toBe(false)
    expect(readUpdateRaised("run-2")).toBe(true)
  })

  it("is kept in memory where local storage throws", () => {
    for (const method of ["setItem", "getItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked")
      })
    }
    writeUpdateRaised("run-1")
    expect(readUpdateRaised("run-1")).toBe(true)
    expect(readUpdateRaised("run-2")).toBe(false)
    clearUpdateRaised()
    expect(readUpdateRaised("run-1")).toBe(false)
  })
})
