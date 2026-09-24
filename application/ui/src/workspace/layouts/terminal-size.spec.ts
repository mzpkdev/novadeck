import { context, describe, expect, it } from "../../test"
import { canvasPresetSize, gridPresetWidth } from "./terminal-size"

describe("terminal size presets", () => {
  context("on Canvas", () => {
    it("uses fixed dimensions for both presets", () => {
      expect(canvasPresetSize("large")).toEqual({ width: 1200, height: 800 })
      expect(canvasPresetSize("small")).toEqual({ width: 600, height: 400 })
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
