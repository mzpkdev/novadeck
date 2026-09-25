import { context, describe, expect, it } from "../../test"
import { createCanvasVisit } from "./canvas-visit"

const overview = { x: 100, y: -50, zoom: 0.4 }
const closeup = { x: -600, y: -200, zoom: 1.5 }
const other = { x: -1200, y: 300, zoom: 1 }

describe("Canvas fly-to visits", () => {
  it("returns to the exact camera and starts a fresh visit on the third gesture", () => {
    const visit = createCanvasVisit()
    const outward = visit.begin("a", overview, closeup)!
    expect(outward.viewport).toEqual(closeup)
    visit.finish(outward)
    const returning = visit.begin("a", closeup, closeup)!
    expect(returning.viewport).toEqual(overview)
    visit.finish(returning)
    expect(visit.begin("a", overview, closeup)?.viewport).toEqual(closeup)
  })
  it("returns to the exact camera when requested during the outward flight", () => {
    const visit = createCanvasVisit()
    const outward = visit.begin("a", overview, closeup)!
    expect(visit.back()).toBeNull()
    const returning = visit.finish(outward)!
    expect(returning.viewport).toEqual(overview)
    visit.finish(returning)
    expect(visit.visiting).toBe(false)
    expect(visit.back()).toBeNull()
  })
  it("starts a new pair when flying to another terminal", () => {
    const visit = createCanvasVisit()
    visit.finish(visit.begin("a", overview, closeup)!)
    visit.finish(visit.begin("b", closeup, other)!)
    expect(visit.begin("b", other, other)?.viewport).toEqual(closeup)
  })
  it("ignores repeated gestures during both flight directions", () => {
    const visit = createCanvasVisit()
    const outward = visit.begin("a", overview, closeup)!
    expect(visit.begin("b", closeup, other)).toBeNull()
    visit.finish(outward)
    const returning = visit.begin("a", closeup, closeup)!
    expect(visit.begin("a", overview, closeup)).toBeNull()
    visit.finish(returning)
    expect(visit.flying).toBe(false)
  })
  context("after manual camera movement", () => {
    it("uses the moved camera as the next return point", () => {
      const visit = createCanvasVisit()
      visit.finish(visit.begin("a", overview, closeup)!)
      visit.clear()
      const next = visit.begin("a", other, closeup)!
      expect(next.viewport).toEqual(closeup)
      visit.finish(next)
      expect(visit.begin("a", closeup, closeup)?.viewport).toEqual(other)
    })
    it("does not let an interrupted flight unlock or clear a newer visit", () => {
      const visit = createCanvasVisit()
      const interrupted = visit.begin("a", overview, closeup)!
      visit.clear()
      const next = visit.begin("b", closeup, other)!
      visit.finish(interrupted, false)
      expect(visit.begin("a", other, closeup)).toBeNull()
      visit.finish(next)
      expect(visit.begin("b", other, other)?.viewport).toEqual(closeup)
    })
  })
  it("discards a return point when the camera could not complete the flight", () => {
    const visit = createCanvasVisit()
    visit.finish(visit.begin("a", overview, closeup)!, false)
    expect(visit.begin("a", overview, closeup)?.viewport).toEqual(closeup)
  })
})
