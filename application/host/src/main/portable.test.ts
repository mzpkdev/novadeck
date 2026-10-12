import type { InstallResult } from "@novadeck/protocol/bridge"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"

import { installAppChannel, openInstalledChannel, portableChannel } from "../bridge.js"
import { context, describe, expect, it } from "../test"
import type { InstalledCopy, InstallOutcome } from "./install-linux"
import {
  leaveForNewerInstalled,
  portableInstaller,
  registerPortableIpc,
  type NewerInstalledCheck,
  type PortableHost,
} from "./portable"

// A host that records what it was asked, in order.
const hosting = (overrides: Partial<PortableHost> = {}) => {
  const calls: string[] = []
  const host: PortableHost = {
    portable: true,
    version: "1.0.0",
    source: "/dl/novadeck.AppImage",
    find: async () => [],
    install: async (source, target): Promise<InstallOutcome> => {
      calls.push(`install ${source}${target ? ` over ${target}` : ""}`)
      return { kind: "installed", image: "/i/novadeck.AppImage" }
    },
    shutdown: async () => void calls.push("shutdown"),
    start: (image) => {
      calls.push(`start ${image}`)
      return true
    },
    quit: () => void calls.push("quit"),
    log: () => {},
    ...overrides,
  }
  return { host, calls }
}

// Lets the shutdown and relaunch that follow an answer run.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const copy = (version: string | undefined): InstalledCopy => ({
  image: "/n/novadeck.AppImage",
  version,
})

describe("what a portable copy reports", () => {
  it("is portable, with this build's version", () => {
    expect(portableInstaller(hosting().host).state()).toEqual({ portable: true, version: "1.0.0" })
  })

  it("is not portable for an installed copy", () => {
    expect(portableInstaller(hosting({ portable: false }).host).state()).toEqual({
      portable: false,
    })
  })
})

describe("installing from a portable copy", () => {
  it("installs this very file, shuts down, then starts the installed copy", async () => {
    const { host, calls } = hosting()
    const result = await portableInstaller(host).install()
    expect(result).toEqual({ kind: "installing" })
    await settle()
    expect(calls).toEqual([
      "install /dl/novadeck.AppImage",
      "shutdown",
      "start /i/novadeck.AppImage",
    ])
  })

  it("replaces an installed copy that is the same or older", async () => {
    const runs = ["1.0.0", "0.9.0", undefined].map(async (version) => {
      const { host, calls } = hosting({ find: async () => [copy(version)] })
      return { result: await portableInstaller(host).install(), calls }
    })
    for (const { result, calls } of await Promise.all(runs)) {
      expect(result).toEqual({ kind: "installing" })
      expect(calls[0]).toBe("install /dl/novadeck.AppImage over /n/novadeck.AppImage")
    }
  })

  it("replaces the installer's copy before Homebrew's, and makes no second copy", async () => {
    const both = [
      { image: "/c/novadeck.AppImage", version: "1.0.0" },
      { image: "/b/novadeck.AppImage", version: "0.9.0" },
    ]
    const { host, calls } = hosting({ find: async () => both })
    await portableInstaller(host).install()
    await settle()
    expect(calls).toEqual([
      "install /dl/novadeck.AppImage over /c/novadeck.AppImage",
      "shutdown",
      "start /i/novadeck.AppImage",
    ])
    const brew = hosting({ find: async () => both.slice(1) })
    await portableInstaller(brew.host).install()
    expect(brew.calls[0]).toBe("install /dl/novadeck.AppImage over /b/novadeck.AppImage")
  })

  it("leaves a newer installed copy alone and says which version it is", async () => {
    const { host, calls } = hosting({ find: async () => [copy("1.1.0")] })
    expect(await portableInstaller(host).install()).toEqual({ kind: "newer", version: "1.1.0" })
    await settle()
    expect(calls).toEqual([])
  })

  it("fails with the reason, and keeps running", async () => {
    const { host, calls } = hosting({
      install: async () => ({ kind: "failed", reason: "There is no space left on the disk." }),
    })
    expect(await portableInstaller(host).install()).toEqual({
      kind: "failed",
      reason: "There is no space left on the disk.",
    })
    await settle()
    expect(calls).toEqual([])
  })

  it("fails, and logs, when installing throws", async () => {
    const logged: string[] = []
    const { host } = hosting({
      install: () => Promise.reject(new Error("boom")),
      log: (message) => void logged.push(message),
    })
    expect(await portableInstaller(host).install()).toEqual({
      kind: "failed",
      reason: "Installing failed.",
    })
    expect(logged).toEqual(["Installing failed."])
  })

  it("installs nothing from a copy that is not portable", async () => {
    const { host, calls } = hosting({ portable: false })
    expect((await portableInstaller(host).install()).kind).toBe("failed")
    expect(calls).toEqual([])
  })

  it("does nothing more for a second request, whether under way or after leaving", async () => {
    const { host, calls } = hosting()
    const installer = portableInstaller(host)
    const [first, second] = await Promise.all([installer.install(), installer.install()])
    expect([first, second]).toEqual([{ kind: "installing" }, { kind: "installing" }])
    expect(await installer.install()).toEqual({ kind: "installing" })
    await settle()
    expect(calls.filter((call) => call.startsWith("install"))).toHaveLength(1)
    expect(calls.filter((call) => call === "shutdown")).toHaveLength(1)
  })

  context("when the installed copy will not start", () => {
    it("quits, as the shells are gone", async () => {
      const { host, calls } = hosting({ start: () => false })
      await portableInstaller(host).install()
      await settle()
      expect(calls).toEqual(["install /dl/novadeck.AppImage", "shutdown", "quit"])
    })
  })

  context("when shutting down fails", () => {
    it("still starts the installed copy", async () => {
      const { host, calls } = hosting({ shutdown: () => Promise.reject(new Error("runner gone")) })
      await portableInstaller(host).install()
      await settle()
      expect(calls).toEqual(["install /dl/novadeck.AppImage", "start /i/novadeck.AppImage"])
    })
  })
})

describe("opening the installed copy found newer", () => {
  it("shuts down and starts it", async () => {
    const { host, calls } = hosting({ find: async () => [copy("1.1.0")] })
    const installer = portableInstaller(host)
    await installer.install()
    installer.openInstalled()
    await settle()
    expect(calls).toEqual(["shutdown", "start /n/novadeck.AppImage"])
  })

  it("does nothing before one was found", async () => {
    const { host, calls } = hosting()
    portableInstaller(host).openInstalled()
    await settle()
    expect(calls).toEqual([])
  })
})

describe("a launch of a portable copy", () => {
  const checking = (overrides: Partial<NewerInstalledCheck> = {}) => {
    const calls: string[] = []
    const check: NewerInstalledCheck = {
      portable: true,
      version: "1.0.0",
      find: async () => [copy("1.1.0")],
      ask: async (version) => {
        calls.push(`ask ${version}`)
        return true
      },
      start: (image) => {
        calls.push(`start ${image}`)
        return true
      },
      alert: async () => void calls.push("alert"),
      quit: () => void calls.push("quit"),
      log: () => {},
      ...overrides,
    }
    return { check, calls }
  }

  it("offers to open a newer installed copy, and starts it when asked", async () => {
    const { check, calls } = checking()
    expect(await leaveForNewerInstalled(check)).toBe(true)
    expect(calls).toEqual(["ask 1.1.0", "start /n/novadeck.AppImage"])
  })

  it("quits when the person chooses to", async () => {
    const { check, calls } = checking({ ask: async () => false })
    expect(await leaveForNewerInstalled(check)).toBe(true)
    expect(calls).toEqual(["quit"])
  })

  it("tells the person and quits when the installed copy will not start", async () => {
    const { check, calls } = checking({ start: () => false })
    expect(await leaveForNewerInstalled(check)).toBe(true)
    expect(calls).toEqual(["ask 1.1.0", "alert", "quit"])
  })

  it("goes on when no installed copy is newer, or when the copy is not portable", async () => {
    const runs = [
      { find: async () => [copy("1.0.0"), copy(undefined)] },
      { find: async () => [] },
      { portable: false },
    ].map(async (overrides) => {
      const { check, calls } = checking(overrides)
      return { left: await leaveForNewerInstalled(check), calls }
    })
    for (const { left, calls } of await Promise.all(runs)) {
      expect(left).toBe(false)
      expect(calls).toEqual([])
    }
  })

  it("goes on, and logs, when the installed copies cannot be looked at", async () => {
    const logged: string[] = []
    const { check } = checking({
      find: () => Promise.reject(new Error("denied")),
      log: (message) => void logged.push(message),
    })
    expect(await leaveForNewerInstalled(check)).toBe(false)
    expect(logged).toHaveLength(1)
  })
})

describe("answering the app's pages", () => {
  type Handler = (event: unknown) => unknown
  const registered = (known: boolean) => {
    const handlers = new Map<string, Handler>()
    const { host, calls } = hosting()
    const installer = portableInstaller(host)
    registerPortableIpc(
      {
        handle: (channel, listener) => void handlers.set(channel, listener as Handler),
        on: (channel, listener) => void handlers.set(channel, listener as Handler),
      },
      { window: () => (known ? "window" : undefined), installer },
    )
    const ask = (channel: string): unknown =>
      handlers.get(channel)!({} as IpcMainEvent & IpcMainInvokeEvent)
    return { ask, calls }
  }

  it("tells the app's own page whether the copy is portable, and installs for it", async () => {
    const { ask, calls } = registered(true)
    expect(await ask(portableChannel)).toEqual({ portable: true, version: "1.0.0" })
    expect(await (ask(installAppChannel) as Promise<InstallResult>)).toEqual({ kind: "installing" })
    expect(calls[0]).toBe("install /dl/novadeck.AppImage")
  })

  it("tells any other sender the copy is not portable, and refuses it", async () => {
    const { ask, calls } = registered(false)
    expect(await ask(portableChannel)).toEqual({ portable: false })
    expect(await ask(installAppChannel)).toMatchObject({ kind: "failed" })
    ask(openInstalledChannel)
    await settle()
    expect(calls).toEqual([])
  })
})
