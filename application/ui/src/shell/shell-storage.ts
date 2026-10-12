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

// The version of the update whose notice came up last, so a relaunch doesn't raise it
// again; a newer version raises its own.
export const updateSeenStorageKey = "novadeck.update-seen"
export const readUpdateSeen = (): string | null => {
  try {
    const stored = localStorage.getItem(updateSeenStorageKey)
    return stored || null
  } catch {
    return null
  }
}

// The offer whose notice came up in this run of the app, by its `updateKey`. It lives in
// session storage, which outlasts a page reload but not a relaunch, so a stale portable
// copy's every-launch reminder comes once per launch, not once per page. Without storage
// it is kept in memory, and a reload is a launch.
export const updateRaisedStorageKey = "novadeck.update-raised"
let raisedInMemory: string | null = null
export const readUpdateRaised = (): string | null => {
  try {
    return sessionStorage.getItem(updateRaisedStorageKey) || null
  } catch {
    return raisedInMemory
  }
}

export const writeUpdateRaised = (key: string): void => {
  try {
    sessionStorage.setItem(updateRaisedStorageKey, key)
  } catch {
    raisedInMemory = key
  }
}

export const writeUpdateSeen = (version: string | null): void => {
  try {
    if (version === null) localStorage.removeItem(updateSeenStorageKey)
    else localStorage.setItem(updateSeenStorageKey, version)
  } catch {
    /* It comes up again next launch when storage is unavailable. */
  }
}
