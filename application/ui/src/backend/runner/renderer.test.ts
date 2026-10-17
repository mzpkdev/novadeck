import { vi } from "vitest"

import { describe, expect, it } from "../../test"
import { createRenderers, probeWebgl, wantsWebgl, type Drawing } from "./renderer"

const setup = ({ cap = 2, supported = true, failing = false } = {}) => {
  const state = { ligatures: false, failing, loads: 0 }
  let changed = (): void => {}
  const drawings = new Map<string, FakeDrawing>()
  class FakeDrawing implements Drawing {
    disposed = false
    cleared = 0
    lose = (): void => {}
    onContextLoss = (listener: () => void) => {
      this.lose = listener
      return { dispose: () => {} }
    }
    clearTextureAtlas = () => void (this.cleared += 1)
    dispose = () => void (this.disposed = true)
  }
  const pool = createRenderers<string>({
    load: (name) => {
      state.loads += 1
      if (state.failing) throw new Error("no context")
      const drawing = new FakeDrawing()
      drawings.set(name, drawing)
      return drawing
    },
    supported: () => supported,
    cap,
    ligatures: () => state.ligatures,
    watchLigatures: (listener) => {
      changed = listener
      return () => {}
    },
  })
  const live = (name: string): boolean => {
    const drawing = drawings.get(name)
    return Boolean(drawing && !drawing.disposed)
  }
  return {
    pool,
    state,
    live,
    drawing: (name: string) => drawings.get(name)!,
    ligatures: (on: boolean) => {
      state.ligatures = on
      changed()
    },
  }
}

describe("the renderer budget", () => {
  it("gives shown screens a context up to the cap and leaves the rest on the DOM", () => {
    const { pool, live } = setup()
    for (const name of ["a", "b", "c"]) pool.screen(name).take()
    expect([live("a"), live("b"), live("c")]).toEqual([true, true, false])
  })

  it("gives a freed slot to the longest waiting shown screen", () => {
    const { pool, live } = setup()
    const a = pool.screen("a")
    const [b, c, d] = ["b", "c", "d"].map((name) => pool.screen(name))
    a.take()
    b!.take()
    c!.take()
    d!.take()
    a.release()
    expect([live("a"), live("b"), live("c"), live("d")]).toEqual([false, true, true, false])
    b!.dispose()
    expect(live("d")).toBe(true)
  })

  it("keeps a screen shown where WebGL isn't wanted on the DOM, its slot to a waiter", () => {
    const { pool, live } = setup()
    const [a, b, c] = ["a", "b", "c"].map((name) => pool.screen(name))
    a!.take()
    b!.take()
    c!.take()
    a!.take(false)
    expect([live("a"), live("b"), live("c")]).toEqual([false, true, true])
    b!.release()
    a!.take(true)
    expect([live("a"), live("c")]).toEqual([true, true])
  })

  it("wants WebGL in Grid and Focus, never in Canvas, which zooms with a transform", () => {
    expect([wantsWebgl("grid"), wantsWebgl("focus"), wantsWebgl("canvas")]).toEqual([
      true,
      true,
      false,
    ])
  })

  it("tells a screen each time it changes renderer, but not as it closes", () => {
    const { pool } = setup()
    const told: string[] = []
    const a = pool.screen("a", () => told.push("a"))
    a.take()
    a.release()
    a.take()
    a.dispose()
    expect(told).toEqual(["a", "a", "a"])
  })

  it("takes nothing for a parked screen", () => {
    const { pool, live } = setup()
    const a = pool.screen("a")
    a.take()
    a.release()
    expect(live("a")).toBe(false)
    a.take()
    expect(live("a")).toBe(true)
  })

  it("never loads where WebGL is unsupported", () => {
    const { pool, state } = setup({ supported: false })
    pool.screen("a").take()
    expect(state.loads).toBe(0)
  })

  it("retries once where loading throws, on the next take, then stays on the DOM", () => {
    const { pool, state } = setup({ failing: true })
    const a = pool.screen("a")
    a.take()
    a.take()
    expect(state.loads).toBe(1)
    a.release()
    a.take()
    expect(state.loads).toBe(2)
    a.release()
    a.take()
    expect(state.loads).toBe(2)
  })

  it("retries once after a lost context, on the next take, then stays on the DOM", () => {
    const { pool, live, drawing, state } = setup()
    const a = pool.screen("a")
    a.take()
    drawing("a").lose()
    expect(live("a")).toBe(false)
    expect(drawing("a").disposed).toBe(true)
    expect(state.loads).toBe(1)
    a.release()
    a.take()
    expect(live("a")).toBe(true)
    drawing("a").lose()
    a.release()
    a.take()
    expect(live("a")).toBe(false)
    expect(state.loads).toBe(2)
  })

  it("hands a lost context's slot to a waiter", () => {
    const { pool, live, drawing } = setup({ cap: 1 })
    pool.screen("a").take()
    pool.screen("b").take()
    drawing("a").lose()
    expect(live("b")).toBe(true)
  })

  it("keeps every screen on the DOM renderer while ligatures are on", () => {
    const { pool, live, ligatures } = setup()
    pool.screen("a").take()
    ligatures(true)
    expect(live("a")).toBe(false)
    pool.screen("b").take()
    expect(live("b")).toBe(false)
    ligatures(false)
    expect([live("a"), live("b")]).toEqual([true, true])
  })

  it("clears the texture atlas of a screen that has one", () => {
    const { pool, drawing } = setup()
    const a = pool.screen("a")
    a.refresh()
    a.take()
    a.refresh()
    expect(drawing("a").cleared).toBe(1)
  })

  describe("with screens nobody shows for the moment", () => {
    it("keeps their contexts while no shown screen waits", () => {
      const { pool, live } = setup()
      const [a, b] = ["a", "b"].map((name) => pool.screen(name))
      a!.take()
      b!.take()
      a!.idle()
      b!.idle()
      expect([live("a"), live("b")]).toEqual([true, true])
      pool.screen("c").take(false)
      expect([live("a"), live("b")]).toEqual([true, true])
    })

    it("gives a waiting screen the context of the one idle longest", () => {
      const { pool, live } = setup()
      const [a, b, c] = ["a", "b", "c"].map((name) => pool.screen(name))
      a!.take()
      b!.take()
      b!.idle()
      a!.idle()
      c!.take()
      expect([live("a"), live("b"), live("c")]).toEqual([true, false, true])
    })

    it("never takes the context of a shown screen for a waiter", () => {
      const { pool, live } = setup()
      const [a, b, c] = ["a", "b", "c"].map((name) => pool.screen(name))
      a!.take()
      b!.take()
      c!.take()
      expect([live("a"), live("b"), live("c")]).toEqual([true, true, false])
    })

    it("lets the screen that lost its context draw again when it is shown", () => {
      const { pool, live } = setup()
      const [a, b, c] = ["a", "b", "c"].map((name) => pool.screen(name))
      a!.take()
      b!.take()
      a!.idle()
      c!.take()
      expect(live("a")).toBe(false)
      c!.release()
      a!.take()
      expect(live("a")).toBe(true)
    })

    it("does not give a context to an idle screen that has none", () => {
      const { pool, live } = setup()
      const [a, b, c] = ["a", "b", "c"].map((name) => pool.screen(name))
      a!.take()
      b!.take()
      c!.take()
      c!.idle()
      a!.release()
      expect(live("c")).toBe(false)
    })

    it("does not churn when screens are released and taken again in one go", () => {
      const { pool, live, state } = setup()
      const told: string[] = []
      const [a, b] = ["a", "b"].map((name) => pool.screen(name, () => told.push(name)))
      a!.take()
      b!.take()
      told.length = 0
      a!.idle()
      b!.idle()
      a!.take()
      b!.take()
      expect([live("a"), live("b")]).toEqual([true, true])
      expect(state.loads).toBe(2)
      expect(told).toEqual([])
    })

    it("tells the screen that loses its context", () => {
      const { pool } = setup({ cap: 1 })
      const told: string[] = []
      const a = pool.screen("a", () => told.push("a"))
      a.take()
      a.idle()
      pool.screen("b").take()
      expect(told).toEqual(["a", "a"])
    })
  })
})

describe("probing for WebGL", () => {
  it("frees the probe's context even when asking it throws", () => {
    const lose = vi.fn<() => void>()
    vi.stubGlobal("WebGL2RenderingContext", Object)
    const context = {
      RENDERER: 0,
      getExtension: (name: string) =>
        name === "WEBGL_lose_context" ? { loseContext: lose } : null,
      getParameter: () => {
        throw new Error("context lost")
      },
    }
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as never)
    try {
      expect(probeWebgl()).toBe(false)
      expect(lose).toHaveBeenCalledTimes(1)
    } finally {
      getContext.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
