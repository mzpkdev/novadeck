import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, vi } from "vitest"

import { context, describe, expect, it } from "../test"
import {
  applyAppearance,
  bootRecordKey,
  defaultPreference,
  resolveAppearance,
  startingAppearance,
  type Appearance,
} from "./apply"
import { themes } from "./themes"

const script = readFileSync(join(process.cwd(), "public/theme-boot.js"), "utf8")

// Runs the boot script on a fresh <html> as the page would, with this much saved and
// the system in this scheme, and reads back what it set.
const boot = (saved: string | null, systemDark: boolean): Appearance => {
  const root = document.documentElement
  root.removeAttribute("data-theme")
  root.removeAttribute("data-scheme")
  root.removeAttribute("style")
  if (saved === null) localStorage.removeItem(bootRecordKey)
  else localStorage.setItem(bootRecordKey, saved)
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: systemDark && query === "(prefers-color-scheme: dark)" }),
  })
  // oxlint-disable-next-line no-new-func -- the script runs as the page runs it, as is
  new Function(script)()
  return {
    theme: root.dataset.theme as string,
    scheme: root.dataset.scheme as Appearance["scheme"],
  }
}

afterEach(() => {
  localStorage.removeItem(bootRecordKey)
  delete (window as { matchMedia?: unknown }).matchMedia
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-scheme")
  document.documentElement.removeAttribute("data-scheme-switching")
  document.documentElement.removeAttribute("style")
})

const systems = [false, true]
const schemesOf = (id: string) => themes.find((theme) => theme.id === id)!.schemes
const schemes = ["system", "light", "dark"] as const

describe("the boot script", () => {
  it("shows what apply.ts resolves for every choice it saves", () => {
    for (const { id } of themes)
      for (const scheme of schemes)
        for (const systemDark of systems) {
          const preference = { theme: id, scheme }
          const record = { ...preference, schemes: schemesOf(id) }
          expect(boot(JSON.stringify(record), systemDark)).toEqual(
            resolveAppearance(preference, systemDark, themes),
          )
        }
  })

  it("gives <html> the scheme's color-scheme until the app shows the theme", () => {
    const root = document.documentElement
    boot(JSON.stringify({ theme: "graphite", scheme: "system", schemes: ["light", "dark"] }), true)
    expect(root.style.colorScheme).toBe("dark")

    applyAppearance(root, startingAppearance(window, themes))

    expect(root.style.colorScheme).toBe("")
  })

  it("shows a theme with one scheme in it, whatever the mode or the system", () => {
    for (const scheme of schemes)
      for (const systemDark of systems) {
        expect(
          boot(JSON.stringify({ theme: "phosphor-green", scheme, schemes: ["dark"] }), systemDark),
        ).toEqual({
          theme: "phosphor-green",
          scheme: "dark",
        })
        expect(document.documentElement.style.colorScheme).toBe("dark")
      }
  })

  context("with a record without a theme, as the previous version saved", () => {
    it("shows the default theme in the saved scheme", () => {
      for (const scheme of schemes)
        for (const systemDark of systems)
          expect(boot(JSON.stringify({ scheme }), systemDark)).toEqual(
            resolveAppearance({ theme: "graphite", scheme }, systemDark, themes),
          )
    })
  })

  it("shows a theme it does not know from the record's own schemes", () => {
    // Imported themes are not in anything the script could hold.
    for (const systemDark of systems) {
      expect(
        boot(
          JSON.stringify({ theme: "sandstone", scheme: "system", schemes: ["light"] }),
          systemDark,
        ),
      ).toEqual({ theme: "sandstone", scheme: "light" })
      expect(
        boot(
          JSON.stringify({ theme: "ember", scheme: "light", schemes: ["dark", "light"] }),
          systemDark,
        ),
      ).toEqual({ theme: "ember", scheme: "light" })
    }
  })

  it("shows the app's default where the app has none of the theme", () => {
    const root = document.documentElement
    boot(JSON.stringify({ theme: "sandstone", scheme: "dark", schemes: ["dark"] }), false)
    expect(root.dataset.theme).toBe("sandstone")

    applyAppearance(root, startingAppearance(window, themes))

    expect(root.dataset).toMatchObject({ theme: "graphite", scheme: "dark" })
  })

  context("with a record older versions saved", () => {
    it("shows a record without schemes as the default theme, in the saved scheme", () => {
      for (const scheme of schemes)
        for (const systemDark of systems)
          for (const old of [{ scheme }, { theme: "phosphor-green", scheme }])
            expect(boot(JSON.stringify(old), systemDark)).toEqual(
              resolveAppearance({ theme: "graphite", scheme }, systemDark, themes),
            )
    })
  })

  context("with a record of the wrong shape", () => {
    const wrong = [
      { theme: "Graphite" },
      { theme: "graph ite" },
      { theme: "" },
      { theme: "constructor!" },
      { theme: 1 },
      { schemes: [] },
      { schemes: ["dim"] },
      { schemes: ["dark", "dim"] },
      { schemes: "dark" },
      { schemes: undefined },
    ]

    it("shows the default theme in the saved scheme", () => {
      for (const scheme of schemes)
        for (const systemDark of systems)
          for (const bad of wrong) {
            const record = { theme: "phosphor-green", scheme, schemes: ["dark"], ...bad }
            expect(boot(JSON.stringify(record), systemDark)).toEqual(
              resolveAppearance({ theme: "graphite", scheme }, systemDark, themes),
            )
          }
    })

    it("shows the default theme in the system's scheme when the scheme is bad", () => {
      for (const scheme of ["dim", 1, null])
        for (const systemDark of systems)
          expect(
            boot(
              JSON.stringify({ theme: "phosphor-green", scheme, schemes: ["dark"] }),
              systemDark,
            ),
          ).toEqual(resolveAppearance(defaultPreference(themes), systemDark, themes))
    })
  })

  context("without a usable record", () => {
    const records = [
      null,
      "{",
      "null",
      "[]",
      JSON.stringify({ scheme: "dim" }),
      JSON.stringify({ theme: "graphite", scheme: 1, schemes: ["light", "dark"] }),
      JSON.stringify({ theme: "graphite" }),
    ]

    it("shows the default theme in the system's scheme, as apply.ts would", () => {
      for (const record of records)
        for (const systemDark of systems)
          expect(boot(record, systemDark)).toEqual(
            resolveAppearance(defaultPreference(themes), systemDark, themes),
          )
    })

    it("tolerates storage that throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied")
      })
      expect(boot(null, true)).toEqual(resolveAppearance(defaultPreference(themes), true, themes))
    })
  })
})
