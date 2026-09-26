import { activeProject } from "../model/state"
import { createStore, type MutableStore, type Store } from "../model/store"
import type { PreferencesValue, Workspace } from "../model/types"
import { writePreferences } from "../preferences/preferences-storage"
import { resetPresentation, type ShellState } from "../shell/shell-state"
import { writeSidebarCollapsed, writeWindowedView } from "../shell/shell-storage"
import type { WorkspaceRoute } from "./routing"
import { currentContext, currentState } from "./selectors"

// Presentation state the workspace model does not own. One store per App; it
// starts over on reload apart from the slices persisted below.
export type UiState = {
  // The route the app renders, mirrored from the URL, which stays authoritative.
  readonly location: UiLocation
  readonly preferences: PreferencesValue
  readonly shell: ShellState
}

export type UiLocation = {
  readonly route: WorkspaceRoute
  // History entries the open dialog added above its background entry.
  readonly dialogDepth: number
  readonly navigationType: "POP" | "PUSH" | "REPLACE"
}

export type UiStore = MutableStore<UiState>

export const createUiStore = (initial: UiState): UiStore => createStore(initial)

export const updateShell = (ui: UiStore, change: (shell: ShellState) => ShellState): void =>
  void ui.update((state) => {
    const shell = change(state.shell)
    return shell === state.shell ? state : { ...state, shell }
  })

// Writes one slice to storage now and again whenever it changes; returns the unsubscribe.
export const persist = <S, T>(
  store: Store<S>,
  select: (state: S) => T,
  write: (value: T) => void,
): (() => void) => {
  let saved = select(store.getSnapshot())
  write(saved)
  return store.subscribe(() => {
    const next = select(store.getSnapshot())
    if (Object.is(next, saved)) return
    saved = next
    write(next)
  })
}

// Every slice that outlives a reload, including the active session's windowed view.
export const persistUi = (ui: Store<UiState>, workspace: Store<Workspace>): (() => void) => {
  const stops = [
    persist(ui, (state) => state.preferences, writePreferences),
    persist(ui, (state) => state.shell.sidebarCollapsed, writeSidebarCollapsed),
    persist(workspace, (snapshot) => currentState(snapshot).windowedView, writeWindowedView),
  ]
  return () => stops.forEach((stop) => stop())
}

// Starts the shell's presentation over in the same commit that changes the session,
// so the first render of the new session already sees it.
export const watchPresentation = (workspace: Store<Workspace>, ui: UiStore): (() => void) => {
  let context = currentContext(workspace.getSnapshot())
  return workspace.subscribe(() => {
    const snapshot = workspace.getSnapshot()
    const next = currentContext(snapshot)
    if (next === context) return
    context = next
    const workspaceSessionId = activeProject(snapshot)!.activeSessionId
    updateShell(ui, (shell) => resetPresentation(shell, workspaceSessionId))
  })
}
