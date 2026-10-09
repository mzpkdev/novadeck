import { EventEmitter } from "node:events"

import type { IpcMainEvent } from "electron"
import { afterEach, beforeEach, vi } from "vitest"

import { installUpdateChannel, updateReadyChannel, updateRequestChannel } from "../bridge.js"
import { context, describe, expect, it } from "../test"
import {
  bundleOf,
  checkForUpdates,
  checkIntervalMs,
  developerIdSigned,
  firstCheckMs,
  installUpdate,
  registerUpdateIpc,
  trackUpdate,
  updateMode,
  updateVersionOf,
  type Updater,
  type UpdateBuild,
} from "./updater"

const build = (overrides: Partial<UpdateBuild> = {}): UpdateBuild => ({
  packaged: true,
  version: "0.4.2",
  platform: "linux",
  env: {},
  ...overrides,
})

describe("which builds update themselves", () => {
  it("never does in a development run or in a build that carries version 0.0.0", () => {
    expect(updateMode(build({ packaged: false, platform: "win32" }))).toBe("no")
    for (const platform of ["linux", "win32", "darwin"] as const)
      expect(updateMode(build({ version: "0.0.0", platform, env: { APPIMAGE: "/x" } }))).toBe("no")
  })

  it("never does when the launch turns updates off", () => {
    expect(updateMode(build({ platform: "win32", env: { NOVADECK_UPDATES: "off" } }))).toBe("no")
  })

  context("on Linux", () => {
    it("does as an AppImage", () => {
      expect(updateMode(build({ env: { APPIMAGE: "/home/me/novadeck.AppImage" } }))).toBe("yes")
    })

    it("does not as an installed deb or rpm", () => {
      expect(updateMode(build())).toBe("no")
    })
  })

  context("on Windows", () => {
    it("does when installed", () => {
      expect(updateMode(build({ platform: "win32" }))).toBe("yes")
    })

    it("does not as the portable executable", () => {
      const env = { PORTABLE_EXECUTABLE_DIR: "C:\\Tools" }
      expect(updateMode(build({ platform: "win32", env }))).toBe("no")
    })
  })

  context("on macOS", () => {
    it("does only when the app is signed, which is checked apart", () => {
      expect(updateMode(build({ platform: "darwin" }))).toBe("signed")
    })
  })

  it("never does on a platform without an installer", () => {
    expect(updateMode(build({ platform: "freebsd" }))).toBe("no")
  })
})

describe("the macOS app bundle", () => {
  it("is the folder above Contents/MacOS", () => {
    expect(bundleOf("/Applications/novadeck.app/Contents/MacOS/novadeck")).toBe(
      "/Applications/novadeck.app",
    )
  })

  it("counts as signed when codesign names a Developer ID authority", () => {
    const signed =
      "Identifier=dev.mzpk.novadeck\nAuthority=Developer ID Application: Mateusz (ABC)\n"
    expect(developerIdSigned(signed)).toBe(true)
  })

  it("does not when it is unsigned, ad-hoc signed, or signed by another authority", () => {
    expect(developerIdSigned("novadeck.app: code object is not signed at all")).toBe(false)
    expect(developerIdSigned("Identifier=dev.mzpk.novadeck\nSignature=adhoc\n")).toBe(false)
    expect(developerIdSigned("Authority=Apple Development: Someone (XYZ)\n")).toBe(false)
  })
})

describe("an update's version", () => {
  it("is a release's semantic version", () => {
    expect(updateVersionOf("1.2.3")).toBe("1.2.3")
    expect(updateVersionOf("0.10.0-rc.1")).toBe("0.10.0-rc.1")
  })

  it("is nothing else", () => {
    for (const value of [undefined, 3, "1.2", "v1.2.3", "1.2.3 ", "1.2.3\n<b>", "../1.2.3", ""])
      expect(updateVersionOf(value)).toBeUndefined()
  })
})

const page = () => {
  const sent: [string, string][] = []
  return { sent, send: (channel: string, version: string) => void sent.push([channel, version]) }
}

describe("telling pages of a downloaded update", () => {
  it("tells every open page its version", () => {
    const [first, second] = [page(), page()]
    const updates = trackUpdate(() => [first, second])
    updates.downloaded("1.2.3")
    expect(first.sent).toEqual([[updateReadyChannel, "1.2.3"]])
    expect(second.sent).toEqual([[updateReadyChannel, "1.2.3"]])
    expect(updates.version()).toBe("1.2.3")
  })

  it("tells a page that asks later, and nothing before there is an update", () => {
    const late = page()
    const updates = trackUpdate<ReturnType<typeof page>>(() => [])
    updates.request(late)
    expect(late.sent).toEqual([])
    updates.downloaded("1.2.3")
    updates.request(late)
    expect(late.sent).toEqual([[updateReadyChannel, "1.2.3"]])
  })

  it("tells pages of a newer update, but not again of the one they know", () => {
    const open = page()
    const updates = trackUpdate(() => [open])
    updates.downloaded("1.2.3")
    updates.downloaded("1.2.3")
    updates.downloaded("1.3.0")
    expect(open.sent.map(([, version]) => version)).toEqual(["1.2.3", "1.3.0"])
  })

  it("remembers and tells nothing that is not a version", () => {
    const open = page()
    const updates = trackUpdate(() => [open])
    updates.downloaded("latest; rm -rf")
    expect(open.sent).toEqual([])
    expect(updates.version()).toBeUndefined()
  })
})

const registered = (own: boolean) => {
  const listeners = new Map<string, (event: IpcMainEvent) => void>()
  const calls: string[] = []
  registerUpdateIpc(
    { on: (channel, listener) => void listeners.set(channel, listener) },
    {
      window: () => (own ? "window" : undefined),
      request: (window) => void calls.push(`request ${window}`),
      install: () => void calls.push("install"),
    },
  )
  const send = (channel: string): void => listeners.get(channel)?.({} as IpcMainEvent)
  return { send, calls }
}

describe("taking the page's requests about updates", () => {
  it("answers a request for the waiting update for the window it came from", () => {
    const { send, calls } = registered(true)
    send(updateRequestChannel)
    expect(calls).toEqual(["request window"])
  })

  it("installs when asked", () => {
    const { send, calls } = registered(true)
    send(installUpdateChannel)
    expect(calls).toEqual(["install"])
  })

  it("ignores any other sender", () => {
    const { send, calls } = registered(false)
    send(updateRequestChannel)
    send(installUpdateChannel)
    expect(calls).toEqual([])
  })
})

const installing = ({ downloaded = true, installs = true, shutdownMs = 0 } = {}) => {
  const steps: string[] = []
  let stopping = false
  const run = (): void =>
    installUpdate({
      downloaded: () => downloaded,
      stopping: () => stopping,
      stop: () => {
        stopping = true
        steps.push("stop")
      },
      shutdown: async () => {
        steps.push("shutdown")
        await new Promise((resolve) => setTimeout(resolve, shutdownMs))
        steps.push("shut down")
      },
      install: () => {
        steps.push("install")
        if (!installs) throw new Error("no updater")
      },
      quit: () => void steps.push("quit"),
    })
  return { run, steps }
}

describe("restarting into the update", () => {
  it("saves and shuts down the way quitting does, then installs", async () => {
    const { run, steps } = installing()
    run()
    await vi.waitFor(() => expect(steps).toContain("install"))
    expect(steps).toEqual(["stop", "shutdown", "shut down", "install"])
  })

  it("ignores a second request while the first is still shutting down", async () => {
    const { run, steps } = installing({ shutdownMs: 20 })
    run()
    run()
    await vi.waitFor(() => expect(steps).toContain("install"))
    expect(steps.filter((step) => step === "shutdown")).toHaveLength(1)
  })

  it("does nothing while no update is downloaded", async () => {
    const { run, steps } = installing({ downloaded: false })
    run()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(steps).toEqual([])
  })

  it("quits when installing fails after the shutdown", async () => {
    const { run, steps } = installing({ installs: false })
    run()
    await vi.waitFor(() => expect(steps).toContain("quit"))
    expect(steps).toEqual(["stop", "shutdown", "shut down", "install", "quit"])
  })
})

class FakeUpdater extends EventEmitter implements Pick<Updater, "checkForUpdates"> {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = false
  logger: Updater["logger"] = null
  checks = 0
  failing = false
  checkForUpdates(): Promise<unknown> {
    this.checks += 1
    if (!this.failing) return Promise.resolve()
    const error = new Error("offline")
    this.emit("error", error)
    return Promise.reject(error)
  }
}

describe("checking for updates", () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  const checking = () => {
    const updater = new FakeUpdater()
    const downloaded: string[] = []
    const logged: string[] = []
    const cancel = checkForUpdates(updater as unknown as Updater, {
      downloaded: (version) => void downloaded.push(version),
      log: (message) => void logged.push(message),
    })
    return { updater, downloaded, logged, cancel }
  }

  it("downloads on its own, installs on quitting, and accepts the prereleases every release still is", () => {
    const { updater } = checking()
    expect(updater).toMatchObject({
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowPrerelease: true,
    })
  })

  it("checks once shortly after launch, then every few hours", async () => {
    const { updater } = checking()
    await vi.advanceTimersByTimeAsync(firstCheckMs - 1)
    expect(updater.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(updater.checks).toBe(1)
    await vi.advanceTimersByTimeAsync(checkIntervalMs)
    expect(updater.checks).toBe(2)
  })

  it("logs a failed check and tries again at the next one", async () => {
    const { updater, logged } = checking()
    updater.failing = true
    await vi.advanceTimersByTimeAsync(firstCheckMs)
    expect(logged).toEqual(["The update check failed."])
    updater.failing = false
    await vi.advanceTimersByTimeAsync(checkIntervalMs)
    expect(updater.checks).toBe(2)
  })

  it("reports the version of each update it downloaded", () => {
    const { updater, downloaded } = checking()
    updater.emit("update-downloaded", { version: "1.2.3" })
    expect(downloaded).toEqual(["1.2.3"])
  })

  it("stops checking once cancelled", async () => {
    const { updater, cancel } = checking()
    cancel()
    await vi.advanceTimersByTimeAsync(checkIntervalMs * 2)
    expect(updater.checks).toBe(0)
  })
})
