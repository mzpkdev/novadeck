import { EventEmitter } from "node:events"

import type { Session, WebContents, WebPreferences } from "electron"

import { describe, expect, it } from "../test"
import { attachPage, guardPage, lockPagesSession, pagesPartition, webAddress } from "./pages"

describe("a live page's address", () => {
  it("is http or https only", () => {
    expect(webAddress("http://localhost:5173/")).toBe(true)
    expect(webAddress("https://example.com")).toBe(true)
    for (const other of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,x",
      "chrome://gpu",
      "not an address",
      "",
    ])
      expect(webAddress(other)).toBe(false)
  })
})

describe("a page view as it attaches", () => {
  it("gets no preload or Node, a sandbox and the pages' own session, whatever it asked", () => {
    const preferences: WebPreferences = {
      preload: "/evil.js",
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      webviewTag: true,
    }
    const params = { src: "http://localhost:5173/" }
    expect(attachPage(preferences, params)).toBe(true)
    expect(preferences).toEqual({
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      partition: pagesPartition,
    })
  })

  it("is refused for anything but an http(s) address", () => {
    expect(attachPage({}, { src: "file:///etc/passwd" })).toBe(false)
    expect(attachPage({}, {})).toBe(false)
  })
})

// A page view's WebContents as the guard sees it.
class FakeContents extends EventEmitter {
  opener?: (details: { url: string }) => { action: string }
  setWindowOpenHandler(handler: (details: { url: string }) => { action: string }): void {
    this.opener = handler
  }
}

// Whether a navigation of the page view to `url` goes ahead.
const navigates = (contents: FakeContents, event: string, url: string): boolean => {
  let prevented = false
  contents.emit(event, { preventDefault: () => (prevented = true) }, url)
  return !prevented
}

describe("a page view", () => {
  it("opens windows in the person's browser, and only http(s) ones", () => {
    const contents = new FakeContents()
    const opened: string[] = []
    guardPage(contents as unknown as WebContents, (url) => opened.push(url))
    expect(contents.opener?.({ url: "https://example.com/" })).toEqual({ action: "deny" })
    expect(contents.opener?.({ url: "file:///etc/passwd" })).toEqual({ action: "deny" })
    expect(opened).toEqual(["https://example.com/"])
  })

  it("goes only to http(s) addresses, by a link or a redirect", () => {
    const contents = new FakeContents()
    guardPage(contents as unknown as WebContents, () => {})
    expect(navigates(contents, "will-navigate", "http://localhost:5173/next")).toBe(true)
    expect(navigates(contents, "will-navigate", "file:///etc/passwd")).toBe(false)
    expect(navigates(contents, "will-redirect", "https://example.com/")).toBe(true)
    expect(navigates(contents, "will-redirect", "javascript:alert(1)")).toBe(false)
  })
})

describe("the pages' session", () => {
  it("refuses every permission and every download", () => {
    const session = Object.assign(new EventEmitter(), {
      check: undefined as undefined | (() => boolean),
      request: undefined as undefined | ((c: unknown, p: string, r: (ok: boolean) => void) => void),
      device: undefined as undefined | (() => boolean),
      setPermissionCheckHandler(handler: () => boolean) {
        this.check = handler
      },
      setPermissionRequestHandler(
        handler: (c: unknown, p: string, r: (ok: boolean) => void) => void,
      ) {
        this.request = handler
      },
      setDevicePermissionHandler(handler: () => boolean) {
        this.device = handler
      },
    })
    lockPagesSession(session as unknown as Session)
    expect(session.check?.()).toBe(false)
    expect(session.device?.()).toBe(false)
    let granted: boolean | undefined
    session.request?.(undefined, "media", (ok) => (granted = ok))
    expect(granted).toBe(false)
    let prevented = false
    session.emit("will-download", { preventDefault: () => (prevented = true) })
    expect(prevented).toBe(true)
  })
})
