import { DomainError } from "../errors.js"
import { describe, expect, it } from "../test.js"
import { Clips, maxClipBytes } from "./clips.js"

describe("clips", () => {
  it("joins parts at the offsets they name", () => {
    const clips = new Clips()

    expect(clips.write("a", 0, Buffer.from([1, 2]))).toBe(true)
    expect(clips.write("a", 2, Buffer.from([3, 4]))).toBe(false)

    expect(clips.get("a")).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  it("overwrites a part sent again", () => {
    const clips = new Clips()
    clips.write("a", 0, Buffer.from([1, 2, 3, 4]))
    clips.write("a", 2, Buffer.from([9, 9]))

    expect(clips.get("a")).toEqual(Buffer.from([1, 2, 9, 9]))
  })

  it("fills a gap with silence", () => {
    const clips = new Clips()
    clips.write("a", 4, Buffer.from([7, 7]))

    expect(clips.get("a")).toEqual(Buffer.from([0, 0, 0, 0, 7, 7]))
  })

  it("keeps clips apart and forgets a discarded one", () => {
    const clips = new Clips()
    clips.write("a", 0, Buffer.from([1]))
    clips.write("b", 0, Buffer.from([2]))
    clips.discard("a")

    expect(clips.get("a")).toBeUndefined()
    expect(clips.get("b")).toEqual(Buffer.from([2]))
  })

  it("refuses audio past two minutes, leaving the clip as it was", () => {
    const clips = new Clips()
    clips.write("a", 0, Buffer.from([1]))

    expect(() => clips.write("a", maxClipBytes, Buffer.from([1]))).toThrow(DomainError)
    expect(() => clips.write("a", maxClipBytes - 1, Buffer.from([1, 1]))).toThrow(
      "UPLOAD_TOO_LARGE",
    )
    expect(clips.get("a")).toEqual(Buffer.from([1]))
    expect(() => clips.write("a", maxClipBytes - 1, Buffer.from([1]))).not.toThrow()
  })

  it("forgets a clip nobody touched for five minutes when another is written", () => {
    let now = 0
    const clips = new Clips(() => now)
    clips.write("old", 0, Buffer.from([1]))
    now = 4 * 60_000
    clips.write("new", 0, Buffer.from([1]))
    expect(clips.get("old")).toBeDefined()
    now = 6 * 60_000
    clips.write("new", 1, Buffer.from([1]))

    expect(clips.get("old")).toBeUndefined()
    expect(clips.get("new")).toBeDefined()
  })
})
