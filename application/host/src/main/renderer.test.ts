import { context, describe, expect, it } from "../test"
import { isTrustedDocument, isTrustedFrame } from "./renderer"

describe("desktop credential recipient", () => {
  context("when the application's document requests the connection", () => {
    it("allows local hash navigation without changing the trusted document", () => {
      expect(isTrustedDocument("http://127.0.0.1:5173/#/projects", "http://127.0.0.1:5173")).toBe(
        true,
      )
      expect(
        isTrustedDocument("file:///app/ui/index.html#/projects", "file:///app/ui/index.html"),
      ).toBe(true)
    })
  })

  context("when a different document requests the connection", () => {
    it("rejects subframes even when their URL matches the application", () => {
      const main = { url: "http://127.0.0.1:5173" }
      expect(isTrustedFrame(main, main, main.url)).toBe(true)
      expect(isTrustedFrame({ url: main.url }, main, main.url)).toBe(false)
      expect(isTrustedFrame(null, main, main.url)).toBe(false)
    })

    it("rejects other origins, paths, query strings and invalid URLs", () => {
      const trusted = "http://127.0.0.1:5173"
      for (const actual of [
        "https://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5173/other",
        "http://127.0.0.1:5173/?redirect=1",
        "invalid",
      ]) {
        expect(isTrustedDocument(actual, trusted)).toBe(false)
      }
      expect(isTrustedDocument("file:///other/index.html", "file:///app/ui/index.html")).toBe(false)
    })
  })
})
