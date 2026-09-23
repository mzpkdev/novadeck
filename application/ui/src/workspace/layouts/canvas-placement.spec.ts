import { context, describe, expect, it } from "../../test"
import { sessions } from "../mock/sessions"
import { adjacentCanvasPosition } from "./canvas-placement"

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
              "05": { position: { x: 2400, y: 450 } },
            },
            minimized: {},
          },
          400,
        ),
      ).toEqual({ x: 690, y: 80 })
    })
  })
})
