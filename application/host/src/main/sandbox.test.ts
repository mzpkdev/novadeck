import type { IpcMainInvokeEvent } from "electron"

import { sandboxChannel } from "../bridge.js"
import { describe, expect, it } from "../test"
import { registerSandboxIpc, sandboxFix, sandboxState } from "./sandbox"

const repository = { owner: "novadeck-org", repo: "novadeck" }
const fix =
  "curl -fsSL https://github.com/novadeck-org/novadeck/releases/latest/download/install.sh | sh -s -- --sandbox"

describe("the command that turns the sandbox on", () => {
  it("runs the installer of the latest release in its sandbox mode", () => {
    expect(sandboxFix("linux", repository)).toBe(fix)
  })

  it("is nothing off Linux or without a release repository", () => {
    expect(sandboxFix("darwin", repository)).toBeUndefined()
    expect(sandboxFix("win32", repository)).toBeUndefined()
    expect(sandboxFix("linux", undefined)).toBeUndefined()
  })
})

describe("whether the sandbox is on", () => {
  it("is on unless Electron was started without it", () => {
    expect(sandboxState(false, "linux", repository)).toEqual({ sandboxed: true })
  })

  it("offers the fix on Linux when it is off", () => {
    expect(sandboxState(true, "linux", repository)).toEqual({ sandboxed: false, fix })
  })

  it("offers no command when it is off elsewhere, or without a repository", () => {
    expect(sandboxState(true, "darwin", repository)).toEqual({ sandboxed: false, fix: "" })
    expect(sandboxState(true, "linux", undefined)).toEqual({ sandboxed: false, fix: "" })
  })
})

describe("taking the page's request for the sandbox", () => {
  const request = (own: boolean) => {
    let listener: ((event: IpcMainInvokeEvent) => unknown) | undefined
    registerSandboxIpc(
      {
        handle: (name, next) => {
          if (name === sandboxChannel) listener = next
        },
      },
      {
        window: () => (own ? "window" : undefined),
        state: () => Promise.resolve({ sandboxed: false, fix }),
      },
    )
    return listener?.({} as IpcMainInvokeEvent)
  }

  it("answers the app's own page", async () => {
    expect(await request(true)).toEqual({ sandboxed: false, fix })
  })

  it("tells any other sender the sandbox is on", () => {
    expect(request(false)).toEqual({ sandboxed: true })
  })
})
