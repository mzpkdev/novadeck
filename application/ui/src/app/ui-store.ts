import { createStore, type MutableStore, type Store } from "../model/store"
import type { PreferencesValue } from "../model/types"
import { writePreferences } from "../preferences/preferences-storage"
import type { WorkspaceRoute } from "./routing"

// Presentation state the workspace model does not own. One store per App; it
// starts over on reload apart from the slices persisted below.
export type UiState = {
  // The route the app renders, mirrored from the URL, which stays authoritative.
  readonly location: UiLocation
  readonly preferences: PreferencesValue
}

export type UiLocation = {
  readonly route: WorkspaceRoute
  // History entries the open dialog added above its background entry.
  readonly dialogDepth: number
  readonly navigationType: "POP" | "PUSH" | "REPLACE"
}

export type UiStore = MutableStore<UiState>

export const createUiStore = (initial: UiState): UiStore => createStore(initial)

// Writes one slice to storage now and again whenever it changes; returns the unsubscribe.
export const persist = <T>(
  ui: Store<UiState>,
  select: (state: UiState) => T,
  write: (value: T) => void,
): (() => void) => {
  let saved = select(ui.getSnapshot())
  write(saved)
  return ui.subscribe(() => {
    const next = select(ui.getSnapshot())
    if (Object.is(next, saved)) return
    saved = next
    write(next)
  })
}

// Every slice that outlives a reload.
export const persistUi = (ui: Store<UiState>): (() => void) =>
  persist(ui, (state) => state.preferences, writePreferences)
