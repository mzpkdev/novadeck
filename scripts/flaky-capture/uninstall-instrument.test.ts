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

  it("injects the observer setup only into the opt-in uninstall spec", () => {
    const spec = "application/ui/src/specs/uninstall.spec.tsx"
    const code = readFileSync(new URL(`../../${spec}`, import.meta.url), "utf8")
    const quality = instrumentUninstall(code, `/${spec}`, "/events.mjs", "/setup.mjs")!.code
    expect(quality.match(/import "\/setup.mjs"/g)).toHaveLength(1)
    expect(instrumentUninstall(code, `/${spec}`, "/events.mjs")!.code).not.toContain("setup.mjs")
    expect(
      instrumentUninstall(source, `/${file}`, "/events.mjs", "/setup.mjs")!.code,
    ).not.toContain("setup.mjs")
    expect(
      instrumentUninstall(
        code,
        "/application/ui/src/specs/other.spec.tsx",
        "/events.mjs",
        "/setup.mjs",
      ),
    ).toBeUndefined()
  })

  it("leaves every other module untouched", () => {
    expect(
      instrumentUninstall(source, "/application/ui/src/app/App.tsx", "/events.mjs"),
    ).toBeUndefined()
  })
})
