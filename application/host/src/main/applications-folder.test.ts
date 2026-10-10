import { context, describe, expect, it } from "../test"
import {
  offerMove,
  resolveMoveConflict,
  shouldOfferMove,
  type MoveAnswer,
  type MoveBuild,
} from "./applications-folder"

const build = (overrides: Partial<MoveBuild> = {}): MoveBuild => ({
  packaged: true,
  version: "0.4.2",
  platform: "darwin",
  env: {},
  inApplications: false,
  declined: false,
  ...overrides,
})

describe("when to offer a move to Applications", () => {
  it("does on a packaged macOS launch from any other folder", () => {
    expect(shouldOfferMove(build())).toBe(true)
  })

  it("does not once the app is in Applications", () => {
    expect(shouldOfferMove(build({ inApplications: true }))).toBe(false)
  })

  it("does not once the person asked not to be asked again", () => {
    expect(shouldOfferMove(build({ declined: true }))).toBe(false)
  })

  it("does not on other platforms", () => {
    for (const platform of ["linux", "win32"] as const)
      expect(shouldOfferMove(build({ platform }))).toBe(false)
  })

  it("does not in a development run, in a build that carries version 0.0.0, or when updates are off", () => {
    expect(shouldOfferMove(build({ packaged: false }))).toBe(false)
    expect(shouldOfferMove(build({ version: "0.0.0" }))).toBe(false)
    expect(shouldOfferMove(build({ env: { NOVADECK_UPDATES: "off" } }))).toBe(false)
  })
})

describe("a name taken in Applications", () => {
  it("lets the move replace a copy that is not running", () => {
    expect(resolveMoveConflict("exists")).toBe(true)
  })

  it("leaves a copy that is running alone", () => {
    expect(resolveMoveConflict("existsAndRunning")).toBe(false)
  })
})

describe("offering the move", () => {
  const offering = (
    answer: MoveAnswer | Error,
    { moved = true, overrides = {} }: { moved?: boolean; overrides?: Partial<MoveBuild> } = {},
  ) => {
    const steps: string[] = []
    const run = () =>
      offerMove({
        build: build(overrides),
        ask: async () => {
          steps.push("ask")
          if (answer instanceof Error) throw answer
          return answer
        },
        decline: async () => void steps.push("decline"),
        move: () => {
          steps.push("move")
          return moved
        },
        log: (message) => void steps.push(`log ${message}`),
      })
    return { run, steps }
  }

  it("moves when accepted, and tells the launch to stop", async () => {
    const { run, steps } = offering({ move: true, dontAskAgain: false })
    expect(await run()).toBe(true)
    expect(steps).toEqual(["ask", "move"])
  })

  it("goes on where it is when turned down, and asks again at the next launch", async () => {
    const { run, steps } = offering({ move: false, dontAskAgain: false })
    expect(await run()).toBe(false)
    expect(steps).toEqual(["ask"])
  })

  it("keeps the choice not to be asked again, whatever the button", async () => {
    const declined = offering({ move: false, dontAskAgain: true })
    expect(await declined.run()).toBe(false)
    expect(declined.steps).toEqual(["ask", "decline"])
    const accepted = offering({ move: true, dontAskAgain: true })
    expect(await accepted.run()).toBe(true)
    expect(accepted.steps).toEqual(["ask", "decline", "move"])
  })

  context("when the move does not happen", () => {
    it("goes on where it is when Electron could not move the app", async () => {
      const { run } = offering({ move: true, dontAskAgain: false }, { moved: false })
      expect(await run()).toBe(false)
    })

    it("goes on, and logs, when asking or moving throws", async () => {
      const { run, steps } = offering(new Error("no dialog"))
      expect(await run()).toBe(false)
      expect(steps).toEqual(["ask", "log Moving to Applications failed."])
    })
  })

  it("asks nothing when it should not", async () => {
    const { run, steps } = offering(
      { move: true, dontAskAgain: false },
      { overrides: { inApplications: true } },
    )
    expect(await run()).toBe(false)
    expect(steps).toEqual([])
  })
})
