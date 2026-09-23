import type { PreferencesValue, ViewMode } from "../model/types"

export const viewModes: ViewMode[] = ["focus", "grid", "canvas"]
export const preferencesStorageKey = "novadeck.preferences"

export const readPreferences = (): PreferencesValue => {
  const defaults: PreferencesValue = { fontSize: 13, enabledViews: [...viewModes] }
  try {
    const saved = JSON.parse(
      localStorage.getItem(preferencesStorageKey) ?? "null",
    ) as Partial<PreferencesValue> | null
    const enabledViews = Array.isArray(saved?.enabledViews)
      ? viewModes.filter((mode) => saved.enabledViews!.includes(mode))
      : defaults.enabledViews
    return {
      enabledViews: enabledViews.length ? enabledViews : defaults.enabledViews,
      fontSize: [12, 13, 15].includes(saved?.fontSize ?? 0) ? saved!.fontSize! : defaults.fontSize,
    }
  } catch {
    return defaults
  }
}
