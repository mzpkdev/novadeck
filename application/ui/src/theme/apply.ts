import type { Scheme, SchemePreference, ThemeManifest } from "./themes"

// What the person chose. The theme is a plain string because a saved choice may name
// a theme the app no longer has.
export type AppearancePreference = {
  readonly theme: string
  readonly scheme: SchemePreference
}

// What the page shows: a theme the manifest has, in a scheme that theme defines.
export type Appearance<Id extends string = string> = {
  readonly theme: Id
  readonly scheme: Scheme
}

export const themeChangeEvent = "novadeck:themechange"

// Where the boot record lives in localStorage; see docs/theming.md.
export const bootRecordKey = "novadeck.theme-boot"

const schemePreferences = new Set<string>(["system", "light", "dark"])

// An unknown theme falls back to the manifest's first; a theme with one scheme always
// uses it, and `system` follows the system's scheme where the theme has it.
export const resolveAppearance = <Id extends string>(
  preference: AppearancePreference,
  systemDark: boolean,
  manifest: ThemeManifest<Id>,
): Appearance<Id> => {
  const theme = manifest.find((entry) => entry.id === preference.theme) ?? manifest[0]
  const wanted: Scheme =
    preference.scheme === "system" ? (systemDark ? "dark" : "light") : preference.scheme
  const scheme = theme.schemes.includes(wanted) ? wanted : theme.schemes[0]
  return { theme: theme.id, scheme }
}

// Reads the theme and scheme from a saved boot record, or nothing when it is missing
// or malformed.
export const parseBootRecord = (text: string | null): AppearancePreference | undefined => {
  if (!text) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== "object" || value === null) return undefined
  const { theme, scheme } = value as Record<string, unknown>
  if (typeof theme !== "string" || typeof scheme !== "string") return undefined
  if (!schemePreferences.has(scheme)) return undefined
  return { theme, scheme: scheme as SchemePreference }
}

// Shows an appearance on the page: `data-theme` and `data-scheme` on the root element.
// Changing a theme already shown stills transitions for one frame, so the page changes
// at once; every change is announced on the window.
export const applyAppearance = (root: HTMLElement, appearance: Appearance): void => {
  const { theme, scheme } = root.dataset
  if (theme === appearance.theme && scheme === appearance.scheme) return
  const view = root.ownerDocument.defaultView
  if (theme !== undefined && view) {
    root.dataset.themeSwitching = ""
    view.requestAnimationFrame(() => {
      delete root.dataset.themeSwitching
    })
  }
  root.dataset.theme = appearance.theme
  root.dataset.scheme = appearance.scheme
  view?.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: appearance }))
}

// Until Preferences holds an appearance, the app is Graphite light.
const fallbackPreference: AppearancePreference = { theme: "graphite", scheme: "light" }

// The appearance to show at startup: the boot record's choice when one is saved,
// else Graphite light, resolved against the system's scheme.
export const startingAppearance = <Id extends string>(
  view: Window,
  manifest: ThemeManifest<Id>,
): Appearance<Id> => {
  let saved: string | null = null
  try {
    saved = view.localStorage.getItem(bootRecordKey)
  } catch {
    // Storage can be unavailable; the fallback applies.
  }
  const systemDark = view.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  return resolveAppearance(parseBootRecord(saved) ?? fallbackPreference, systemDark, manifest)
}
