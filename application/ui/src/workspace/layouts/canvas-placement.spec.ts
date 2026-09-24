import { context, describe, expect, it } from "../../test"
import { sessions } from "../mock/sessions"
import { adjacentCanvasPosition, viewportCanvasPosition } from "./canvas-placement"

describe("keyboard canvas placement", () => {
  context("when neighboring slots are occupied", () => {
    it("places a new terminal in the nearest free slot", () => {
      expect(
        adjacentCanvasPosition(sessions[0]!, sessions, { geometry: {}, minimized: {} }, 400),
      ).toEqual({ x: 80, y: 1000 })
    })

    it("uses saved geometry when a neighboring terminal has moved", () => {
      expect(
        adjacentCanvasPosition(
          sessions[0]!,
          sessions,
          {
            geometry: {
              "02": { position: { x: 2400, y: 80 } },
              "03": { position: { x: 3000, y: 80 } },
              "05": { position: { x: 2400, y: 450 } },
              "06": { position: { x: 3000, y: 525 } },
            },
            minimized: {},
          },
          400,
        ),
      ).toEqual({ x: 690, y: 80 })
    })
  })
})

describe("automatic viewport placement", () => {
  it("uses a visible free spot without moving or scaling the camera", () => {
    const position = viewportCanvasPosition(
      [{ position: { x: 0, y: 0 }, width: 600, height: 400 }],
      { x: 0, y: 0, zoom: 0.5 },
      { width: 1200, height: 800 },
      { width: 600, height: 400 },
    )
    expect(position.x).toBeGreaterThanOrEqual(60)
    expect(position.x + 600).toBeLessThanOrEqual(2400)
    expect(position.y).toBeGreaterThanOrEqual(60)
    expect(position.y + 400).toBeLessThanOrEqual(1600)
    expect(position.x >= 660 || position.y >= 460).toBe(true)
  })

  it("keeps the new terminal clear of occupied space when the viewport is crowded", () => {
    const position = viewportCanvasPosition(
      [{ position: { x: 0, y: 0 }, width: 800, height: 600 }],
      { x: 0, y: 0, zoom: 1 },
      { width: 800, height: 600 },
      { width: 600, height: 400 },
    )
    expect(
      position.x >= 860 || position.x + 660 <= 0 || position.y >= 660 || position.y + 460 <= 0,
    ).toBe(true)
  })
})
