import type { WindowedView } from "../model/types"
import { noArrangement, type ProjectArrangement } from "../projects/project-arrangement"

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

// The order the person left the footer's subscriptions in, by program.
export const subscriptionOrderStorageKey = "novadeck.subscription-order"
export const readSubscriptionOrder = (): readonly string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(subscriptionOrderStorageKey) ?? "[]")
    return Array.isArray(stored) ? stored.filter((each) => typeof each === "string") : []
  } catch {
    return []
  }
}

const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((each) => typeof each === "string") : []

// How the person arranged the switcher's projects: their order and the pinned ones.
export const projectArrangementStorageKey = "novadeck.project-arrangement"
export const readProjectArrangement = (): ProjectArrangement => {
  try {
    const stored = JSON.parse(localStorage.getItem(projectArrangementStorageKey) ?? "null") as {
      order?: unknown
      pinned?: unknown
    } | null
    return stored ? { order: ids(stored.order), pinned: ids(stored.pinned) } : noArrangement
  } catch {
    return noArrangement
  }
}

export const writeSidebarCollapsed = (collapsed: boolean): void => {
  try {
    localStorage.setItem(collapsedStorageKey, String(collapsed))
  } catch {
    /* Collapsing still works when storage is unavailable. */
  }
}

export const writeWindowedView = (view: WindowedView): void => {
  try {
    localStorage.setItem(windowedStorageKey, view)
  } catch {
    /* Remains available for this session when storage is unavailable. */
  }
}

export const writeSubscriptionOrder = (order: readonly string[]): void => {
  try {
    localStorage.setItem(subscriptionOrderStorageKey, JSON.stringify(order))
  } catch {
    /* The order holds for this session when storage is unavailable. */
  }
}

export const writeProjectArrangement = (arrangement: ProjectArrangement): void => {
  try {
    localStorage.setItem(projectArrangementStorageKey, JSON.stringify(arrangement))
  } catch {
    /* The arrangement holds for this session when storage is unavailable. */
  }
}
