import { context, describe, expect, it } from "../../test"
import { canvasPresetSize, gridPresetWidth } from "./terminal-size"

describe("terminal size presets", () => {
  context("on Canvas", () => {
    it("keeps compact dimensions and a fallback for an unmeasured viewport", () => {
      expect(canvasPresetSize("large")).toEqual({ width: 1200, height: 800 })
      expect(canvasPresetSize("small")).toEqual({ width: 600, height: 400 })
    })
    for (const viewport of [
      { width: 1600, height: 900 },
      { width: 500, height: 1000 },
    ]) {
      it(`matches the ${viewport.width}×${viewport.height} viewport ratio at the same large area`, () => {
        const size = canvasPresetSize("large", viewport)
        expect(size.width / size.height).toBeCloseTo(viewport.width / viewport.height, 2)
        expect(Math.abs(size.width * size.height - 960000)).toBeLessThan(1500)
        expect(
          canvasPresetSize("large", { width: viewport.width * 2, height: viewport.height * 2 }),
        ).toEqual(size)
        expect(canvasPresetSize("small", viewport)).toEqual({ width: 600, height: 400 })
      })
    }
    it("respects minimum dimensions on extreme aspect ratios", () => {
      expect(canvasPresetSize("large", { width: 1, height: 10000 }).width).toBe(320)
      expect(canvasPresetSize("large", { width: 10000, height: 1 }).height).toBe(200)
      expect(canvasPresetSize("large", { width: 0, height: 0 })).toEqual({
        width: 1200,
        height: 800,
      })
    })
  })
  context("in Grid", () => {
    it("uses full width or half width on desktop", () => {
      expect(gridPresetWidth(16, "large")).toBe(16)
      expect(gridPresetWidth(16, "small")).toBe(8)
      expect(gridPresetWidth(12, "large")).toBe(12)
      expect(gridPresetWidth(12, "small")).toBe(6)
    })
    it("honors the minimum four columns on narrow screens", () => {
      expect(gridPresetWidth(8, "small")).toBe(4)
      expect(gridPresetWidth(4, "large")).toBe(4)
      expect(gridPresetWidth(4, "small")).toBe(4)
    })
  })
})
