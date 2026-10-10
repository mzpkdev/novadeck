import { context, describe, expect, it } from "../test"
import {
  bundleVersionOf,
  isNewerVersion,
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
  signed: true,
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

  it("does not for a build that is not Developer ID signed, which only tells of updates", () => {
    expect(shouldOfferMove(build({ signed: false }))).toBe(false)
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
  const running = "0.5.0"

  it("lets the move replace a copy that is not running", () => {
    expect(
      resolveMoveConflict("exists", { existingVersion: "0.4.0", runningVersion: running }),
    ).toBe(true)
    expect(
      resolveMoveConflict("exists", { existingVersion: running, runningVersion: running }),
    ).toBe(true)
  })

  it("lets it replace a copy whose version cannot be read", () => {
    expect(
      resolveMoveConflict("exists", { existingVersion: undefined, runningVersion: running }),
    ).toBe(true)
    expect(
      resolveMoveConflict("exists", { existingVersion: "garbage", runningVersion: running }),
    ).toBe(true)
  })

  it("cancels the move rather than replace a newer copy", () => {
    expect(
      resolveMoveConflict("exists", { existingVersion: "0.5.1", runningVersion: running }),
    ).toBe(false)
    expect(
      resolveMoveConflict("exists", { existingVersion: "1.0.0", runningVersion: running }),
    ).toBe(false)
    expect(
      resolveMoveConflict("exists", { existingVersion: "0.5.0", runningVersion: "0.5.0-beta.1" }),
    ).toBe(false)
  })

  it("leaves a copy that is running alone", () => {
    expect(
      resolveMoveConflict("existsAndRunning", {
        existingVersion: "0.1.0",
        runningVersion: running,
      }),
    ).toBe(false)
  })
})

describe("which version is newer", () => {
  it("compares numbers, not text", () => {
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true)
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false)
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false)
  })

  it("puts a release above its prereleases", () => {
    expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(true)
    expect(isNewerVersion("1.0.0-beta.1", "1.0.0")).toBe(false)
    expect(isNewerVersion("1.0.0-beta.2", "1.0.0-beta.1")).toBe(true)
  })

  it("is false for what is not a release's version", () => {
    expect(isNewerVersion("x", "1.0.0")).toBe(false)
    expect(isNewerVersion("2.0.0", "x")).toBe(false)
  })
})

describe("the version of an app in Applications", () => {
  it("is the short version string of its Info.plist", () => {
    const plist =
      "<dict><key>CFBundleVersion</key><string>9</string>\n<key>CFBundleShortVersionString</key>\n\t<string>1.2.3</string></dict>"
    expect(bundleVersionOf(plist)).toBe("1.2.3")
  })

  it("is nothing without one", () => {
    expect(bundleVersionOf("<dict></dict>")).toBeUndefined()
    expect(bundleVersionOf("bplist00")).toBeUndefined()
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
        decline: () => void steps.push("decline"),
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
