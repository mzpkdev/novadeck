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
const schemes = ["system", "light", "dark"] as const

describe("the boot script", () => {
  it("lists the themes theme/themes.ts does", () => {
    const listed = /const themes = (\{[^}]*\})/.exec(script)?.[1]
    // The script's object literal as JSON: bare keys quoted, a trailing comma dropped.
    const json = listed!.replace(/([{,]\s*)(\w+):/g, '$1"$2":').replace(/,(\s*\})/, "$1")
    expect(JSON.parse(json)).toEqual(
      Object.fromEntries(themes.map((theme) => [theme.id, theme.schemes])),
    )
  })

  it("shows what apply.ts resolves for every choice it saves", () => {
    for (const { id } of themes)
      for (const scheme of schemes)
        for (const systemDark of systems) {
          const preference = { theme: id, scheme }
          expect(boot(JSON.stringify(preference), systemDark)).toEqual(
            resolveAppearance(preference, systemDark, themes),
          )
        }
  })

  it("gives <html> the scheme's color-scheme until the app shows the theme", () => {
    const root = document.documentElement
    boot(JSON.stringify({ theme: "graphite", scheme: "system" }), true)
    expect(root.style.colorScheme).toBe("dark")

    applyAppearance(root, startingAppearance(window, themes))

    expect(root.style.colorScheme).toBe("")
  })

  it("shows a theme with one scheme in it, whatever the mode or the system", () => {
    for (const scheme of schemes)
      for (const systemDark of systems) {
        expect(boot(JSON.stringify({ theme: "phosphor-green", scheme }), systemDark)).toEqual({
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

  context("with a record older versions saved", () => {
    it("shows an unknown theme as the default theme, in the saved scheme", () => {
      for (const scheme of schemes)
        for (const systemDark of systems) {
          const record = JSON.stringify({ theme: "sandstone", scheme, schemes: ["light"] })
          expect(boot(record, systemDark)).toEqual(
            resolveAppearance({ theme: "graphite", scheme }, systemDark, themes),
          )
        }
    })

    it("shows it as the app does at startup", () => {
      const root = document.documentElement
      const record = JSON.stringify({ theme: "sandstone", scheme: "dark", schemes: ["light"] })
      expect(boot(record, false)).toEqual({ theme: "graphite", scheme: "dark" })

      applyAppearance(root, startingAppearance(window, themes))

      expect(root.dataset).toMatchObject({ theme: "graphite", scheme: "dark" })
    })

    it("does not take a theme named like an object property", () => {
      expect(boot(JSON.stringify({ theme: "constructor", scheme: "light" }), false)).toEqual({
        theme: "graphite",
        scheme: "light",
      })
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
