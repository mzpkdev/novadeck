import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, vi } from "vitest"

import { context, describe, expect, it } from "../test"
import {
  bootRecordKey,
  bootRecordOf,
  defaultPreference,
  resolveAppearance,
  type Appearance,
} from "./apply"
import { themes, type ThemeManifest } from "./themes"

const script = readFileSync(join(process.cwd(), "public/theme-boot.js"), "utf8")

// Runs the boot script on a fresh <html> as the page would, with this much saved and
// the system in this scheme, and reads back what it set.
const boot = (saved: string | null, systemDark: boolean): Appearance => {
  const root = document.documentElement
  root.removeAttribute("data-theme")
  root.removeAttribute("data-scheme")
  if (saved === null) localStorage.removeItem(bootRecordKey)
  else localStorage.setItem(bootRecordKey, saved)
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: systemDark && query === "(prefers-color-scheme: dark)" }),
  })
  // oxlint-disable-next-line no-new-func -- the script runs as the page runs it, as is
  new Function(script)()
  return { theme: root.dataset.theme!, scheme: root.dataset.scheme as Appearance["scheme"] }
}

afterEach(() => {
  localStorage.removeItem(bootRecordKey)
  delete (window as { matchMedia?: unknown }).matchMedia
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-scheme")
})

const systems = [false, true]
const schemes = ["system", "light", "dark"] as const

describe("the boot script", () => {
  it("shows what apply.ts resolves for every theme and choice it saves", () => {
    for (const { id } of themes)
      for (const scheme of schemes)
        for (const systemDark of systems) {
          const preference = { theme: id, scheme }
          const record = JSON.stringify(bootRecordOf(preference, themes))
          expect(boot(record, systemDark)).toEqual(
            resolveAppearance(preference, systemDark, themes),
          )
        }
  })

  it("keeps a theme with one scheme in that scheme", () => {
    const manifest: ThemeManifest = [...themes, { id: "night", name: "Night", schemes: ["dark"] }]
    for (const scheme of schemes)
      for (const systemDark of systems) {
        const preference = { theme: "night", scheme }
        const record = JSON.stringify(bootRecordOf(preference, manifest))
        expect(boot(record, systemDark)).toEqual({ theme: "night", scheme: "dark" })
      }
  })

  context("without a usable record", () => {
    const records = [
      null,
      "{",
      "null",
      "[]",
      JSON.stringify({ theme: "graphite", scheme: "dim", schemes: ["light"] }),
      JSON.stringify({ theme: "graphite", scheme: "dark", schemes: [] }),
      JSON.stringify({ theme: "graphite", scheme: "dark", schemes: ["sepia"] }),
      JSON.stringify({ theme: '"><script>', scheme: "dark", schemes: ["dark"] }),
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
