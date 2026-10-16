import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { instrumentUninstall } from "./uninstall-instrument.ts"

const file = "application/ui/src/backend/demo/debug/uninstall.ts"
const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")

describe("opt-in uninstall source boundaries", () => {
  it("recognizes the current fixture, component and original poll callbacks", () => {
    for (const path of [
      file,
      "application/ui/src/preferences/UninstallApp.tsx",
      "application/ui/src/specs/uninstall.spec.tsx",
    ])
      expect(
        instrumentUninstall(
          readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
          `/${path}`,
          "/events.mjs",
        )?.file,
      ).toBe(path)
  })

  it("fails closed when a source boundary changes or becomes ambiguous", () => {
    expect(() =>
      instrumentUninstall(
        source.replace("resolve(ends)", "resolve(result)"),
        `/${file}`,
        "/events.mjs",
      ),
    ).toThrow("boundary changed")
    expect(() => instrumentUninstall(source + source, `/${file}`, "/events.mjs")).toThrow(
      "boundary changed",
    )
  })

  it("leaves every other module untouched", () => {
    expect(
      instrumentUninstall(source, "/application/ui/src/app/App.tsx", "/events.mjs"),
    ).toBeUndefined()
  })
})
