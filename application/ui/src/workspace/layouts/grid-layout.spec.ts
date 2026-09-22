import { context, describe, expect, it } from "../../test"
import type { GridLayouts, Session } from "../model/types"
import { expandedGridLayouts, visibleGridLayouts } from "./grid-layout"

const terminal = (id: string): Session => ({
  id,
  name: id,
  directory: "~/projects/storefront",
  command: "zsh",
  process: "zsh",
  state: "idle",
  kind: "shell",
  x: 0,
  y: 0,
  height: 400,
})
const sessions = [terminal("a"), terminal("b")]
const layouts: GridLayouts = {
  desktop: [
    { i: "a", x: 0, y: 0, w: 5, h: 20, minH: 10 },
    { i: "b", x: 0, y: 20, w: 4, h: 12, minH: 10 },
  ],
  mobile: [
    { i: "a", x: 0, y: 0, w: 4, h: 14, minH: 10 },
    { i: "b", x: 0, y: 14, w: 4, h: 12, minH: 10 },
  ],
}

describe("minimized grid layouts", () => {
  context("when a terminal is folded", () => {
    it("keeps its width and closes the gap without mutating its expanded dimensions", () => {
      const visible = visibleGridLayouts(sessions, layouts, { a: true })
      expect(visible.desktop?.[0]).toMatchObject({
        w: 5,
        h: 3,
        minH: 3,
        maxH: 3,
        isResizable: true,
      })
      expect(visible.desktop?.[1]).toMatchObject({ y: 3 })
      expect(layouts.desktop?.[0]).toMatchObject({ w: 5, h: 20 })
      expect(layouts.desktop?.[1]).toMatchObject({ y: 20 })
    })

    it("preserves expanded heights per breakpoint while saving new coordinates", () => {
      const visible = visibleGridLayouts(sessions, layouts, { a: true })
      const moved = {
        ...visible,
        desktop: visible.desktop!.map((item) => (item.i === "a" ? { ...item, x: 6, y: 5 } : item)),
      }
      const saved = expandedGridLayouts(moved, layouts, sessions, { a: true })
      expect(saved.desktop?.[0]).toMatchObject({ x: 6, y: 5, w: 5, h: 20, minH: 10 })
      expect(saved.mobile?.[0]).toMatchObject({ h: 14 })
      const restored = visibleGridLayouts(sessions, saved, {})
      expect(restored.desktop?.[0]).toMatchObject({ h: 20, isResizable: true })
      expect(restored.mobile?.[0]).toMatchObject({ h: 14 })
    })

    it("remembers the default height when folded before a breakpoint has been saved", () => {
      const visible = visibleGridLayouts(sessions, {}, { a: true })
      const saved = expandedGridLayouts(visible, {}, sessions, { a: true })
      const restored = visibleGridLayouts(sessions, saved, {})
      expect(restored.desktop?.[0]).toMatchObject({ h: 18 })
      expect(restored.mobile?.[0]).toMatchObject({ h: 18 })
    })

    it("saves a folded width resize without retaining the temporary height limit", () => {
      const visible = visibleGridLayouts(sessions, layouts, { a: true })
      const resized = {
        ...visible,
        desktop: visible.desktop!.map((item) => (item.i === "a" ? { ...item, w: 7 } : item)),
      }
      const saved = expandedGridLayouts(resized, layouts, sessions, { a: true })
      const restored = visibleGridLayouts(sessions, saved, {})
      expect(restored.desktop?.[0]).toMatchObject({ w: 7, h: 20, minH: 10, isResizable: true })
      expect(restored.desktop?.[0]?.maxH).toBeUndefined()
    })

    it("retains a resize to another terminal while one remains folded", () => {
      const visible = visibleGridLayouts(sessions, layouts, { a: true })
      const resized = {
        ...visible,
        desktop: visible.desktop!.map((item) => (item.i === "b" ? { ...item, h: 24 } : item)),
      }
      const saved = expandedGridLayouts(resized, layouts, sessions, { a: true })
      expect(saved.desktop?.[0]?.h).toBe(20)
      expect(saved.desktop?.[1]?.h).toBe(24)
    })
  })
})
