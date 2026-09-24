import { context, describe, expect, it } from "../../test"
import type { GridLayouts, Session } from "../model/types"
import {
  addCompactGridTerminal,
  expandedGridLayouts,
  gridLayoutsForPreset,
  visibleGridLayouts,
} from "./grid-layout"

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

describe("hidden grid layouts", () => {
  it("closes the visible gap and restores the saved arrangement when shown again", () => {
    const projected = visibleGridLayouts(sessions, layouts, {}, { a: true })
    expect(projected.desktop).toMatchObject([{ i: "b", x: 0, y: 0, w: 4, h: 12 }])
    expect(projected.mobile).toMatchObject([{ i: "b", x: 0, y: 0, w: 4, h: 12 }])

    // The grid reports its compacted projection when children change; that is not a user edit.
    const saved = expandedGridLayouts(projected, layouts, sessions, {}, { a: true })
    expect(saved).toBe(layouts)
    expect(visibleGridLayouts(sessions, saved, {}, {}).desktop).toMatchObject(layouts.desktop!)
    expect(visibleGridLayouts(sessions, saved, {}, {}).mobile).toMatchObject(layouts.mobile!)
  })

  it("retains hidden geometry when a visible terminal is dragged or resized", () => {
    const projected = visibleGridLayouts(sessions, layouts, {}, { a: true })
    const changed = {
      ...projected,
      desktop: projected.desktop!.map((item) => ({ ...item, x: 4, y: 5, w: 6, h: 18 })),
    }
    const saved = expandedGridLayouts(changed, layouts, sessions, {}, { a: true })
    expect(saved.desktop?.find((item) => item.i === "a")).toEqual(layouts.desktop?.[0])
    expect(saved.desktop?.find((item) => item.i === "b")).toMatchObject({
      x: 4,
      y: 5,
      w: 6,
      h: 18,
    })
    expect(saved.mobile).toEqual(layouts.mobile)
  })

  it("keeps a hidden minimized terminal's expanded height during visible edits", () => {
    const projected = visibleGridLayouts(sessions, layouts, { a: true }, { a: true })
    const changed = {
      ...projected,
      desktop: projected.desktop!.map((item) => ({ ...item, w: 5 })),
    }
    const saved = expandedGridLayouts(changed, layouts, sessions, { a: true }, { a: true })
    expect(saved.desktop?.find((item) => item.i === "a")?.h).toBe(20)
    expect(
      visibleGridLayouts(sessions, saved, {}, {}).desktop?.find((item) => item.i === "a")?.h,
    ).toBe(20)
  })
})

describe("automatic grid placement", () => {
  it("uses free room beside existing terminals before adding a row", () => {
    const placed = addCompactGridTerminal(
      [terminal("a")],
      { desktop: [{ i: "a", x: 0, y: 0, w: 6, h: 20 }] },
      terminal("new"),
    )
    expect(placed.desktop?.find((item) => item.i === "new")).toMatchObject({
      x: 6,
      y: 0,
      w: 6,
      h: 18,
    })
  })

  it("uses a new row when a narrow breakpoint has no horizontal room", () => {
    const placed = addCompactGridTerminal(sessions, layouts, terminal("new"))
    expect(placed.desktop?.find((item) => item.i === "new")).toMatchObject({
      x: 5,
      y: 0,
      w: 6,
      h: 18,
    })
    expect(placed.mobile?.find((item) => item.i === "new")).toMatchObject({
      x: 0,
      y: 26,
      w: 4,
      h: 18,
    })
    expect(layouts.desktop?.map((item) => ({ x: item.x, y: item.y }))).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 20 },
    ])
  })
})

describe("grid size presets", () => {
  const responsive: GridLayouts = {
    wide: [
      { i: "a", x: 2, y: 0, w: 6, h: 24, minH: 10 },
      { i: "b", x: 8, y: 0, w: 6, h: 16, minH: 10 },
    ],
    desktop: layouts.desktop!,
    tablet: [
      { i: "a", x: 2, y: 0, w: 4, h: 16, minH: 10 },
      { i: "b", x: 0, y: 16, w: 4, h: 19, minH: 10 },
    ],
    mobile: layouts.mobile!,
  }

  it("applies the selected width at every breakpoint without changing saved heights", () => {
    const large = gridLayoutsForPreset("a", "large", sessions, responsive, {}, {})
    const compact = gridLayoutsForPreset("a", "small", sessions, large, {}, {})

    for (const [breakpoint, largeWidth, compactWidth] of [
      ["wide", 16, 8],
      ["desktop", 12, 6],
      ["tablet", 8, 4],
      ["mobile", 4, 4],
    ] as const) {
      const before = responsive[breakpoint]?.find((item) => item.i === "a")
      expect(large[breakpoint]?.find((item) => item.i === "a")).toMatchObject({
        w: largeWidth,
        h: before?.h,
      })
      expect(compact[breakpoint]?.find((item) => item.i === "a")).toMatchObject({
        w: compactWidth,
        h: before?.h,
      })
    }
  })

  it("restores a minimized terminal and preserves hidden terminal geometry", () => {
    const changed = gridLayoutsForPreset(
      "a",
      "large",
      sessions,
      responsive,
      { a: true },
      { b: true },
    )
    for (const breakpoint of ["wide", "desktop", "tablet", "mobile"] as const) {
      const previous = responsive[breakpoint]
      expect(changed[breakpoint]?.find((item) => item.i === "a")?.h).toBe(
        previous?.find((item) => item.i === "a")?.h,
      )
      expect(changed[breakpoint]?.find((item) => item.i === "b")).toEqual(
        previous?.find((item) => item.i === "b"),
      )
    }
  })
})
