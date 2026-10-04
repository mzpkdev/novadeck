import { Terminal } from "@xterm/xterm"

import { context, describe, expect, it } from "../../test"
import { linkHint, linkTerminal, opensLink, webLink } from "./links"

const click = (keys: Partial<Pick<MouseEvent, "ctrlKey" | "metaKey">> = {}): MouseEvent =>
  new MouseEvent("click", keys)

const range = { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } }

describe("terminal links", () => {
  context("on Apple platforms", () => {
    it("open on ⌘-click only", () => {
      expect(opensLink(click({ metaKey: true }), "mac")).toBe(true)
      expect(opensLink(click({ ctrlKey: true }), "mac")).toBe(false)
      expect(opensLink(click(), "mac")).toBe(false)
      expect(linkHint("mac")).toBe("⌘-click to open")
    })
  })

  context("elsewhere", () => {
    it("open on Ctrl-click only", () => {
      expect(opensLink(click({ ctrlKey: true }), "other")).toBe(true)
      expect(opensLink(click({ metaKey: true }), "other")).toBe(false)
      expect(opensLink(click(), "other")).toBe(false)
      expect(linkHint("other")).toBe("Ctrl-click to open")
    })
  })

  context("by scheme", () => {
    it("leave the app only for web pages", () => {
      expect(webLink("https://example.com/a?b=1")).toBe("https://example.com/a?b=1")
      expect(webLink("http://localhost:5173")).toBe("http://localhost:5173/")
      expect(webLink("file:///etc/passwd")).toBeUndefined()
      expect(webLink("javascript:alert(1)")).toBeUndefined()
      expect(webLink("not a link")).toBeUndefined()
    })
  })

  context("printed as hyperlinks", () => {
    const linked = () => {
      const opened: string[] = []
      const xterm = new Terminal()
      linkTerminal(xterm, { platform: "other", open: (url) => opened.push(url) })
      const handler = xterm.options.linkHandler!
      return {
        opened,
        activate: (event: MouseEvent, text: string) => handler.activate(event, text, range),
      }
    }

    it("open the page on the platform's click", () => {
      const { opened, activate } = linked()
      activate(click({ ctrlKey: true }), "https://example.com")
      expect(opened).toEqual(["https://example.com/"])
    })

    it("stay closed on a plain click or another scheme", () => {
      const { opened, activate } = linked()
      activate(click(), "https://example.com")
      activate(click({ ctrlKey: true }), "file:///etc/passwd")
      expect(opened).toEqual([])
    })
  })
})
