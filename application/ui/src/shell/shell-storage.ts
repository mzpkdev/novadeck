import type { WindowedView } from "../model/types"

export const collapsedStorageKey = "novadeck.sidebar-collapsed"
export const readSidebarCollapsed = (): boolean => {
  try {
    return localStorage.getItem(collapsedStorageKey) === "true"
  } catch {
    return false
  }
}
export const windowedStorageKey = "novadeck.windowed-view"
export const readWindowedView = (): WindowedView => {
  try {
    return localStorage.getItem(windowedStorageKey) === "canvas" ? "canvas" : "grid"
  } catch {
    return "grid"
  }
}
