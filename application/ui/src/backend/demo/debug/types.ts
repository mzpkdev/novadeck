import type { ComponentType } from "react"

import type { Store } from "../../../model/store"
import type { Workspace } from "../../../model/types"
import type { Backend, BackendConnectionState, BackendSink, TerminalKey } from "../../port"

// The demo's debug layer, in two halves: the shell (startup, connection, crash loop, the
// panel itself and which demo runs) and the states a terminal, an agent or the page can
// be put in. The shell composes the backend and the panel; the states provide the parts
// below and the actions the panel lists.

// What the demo's terminal surface reads beyond its engine: whether the far side is
// there to type into, and how to start a fresh shell after one ended.
export type DemoSurfaceRuntime = {
  readonly connection: Store<BackendConnectionState>
  // Restart, or Enter, on an ended terminal.
  readonly restart: (key: TerminalKey) => void
}

// What a state's action may use.
export type DemoActionContext = {
  // The selected terminal of the session on screen, if any.
  readonly selected: () => TerminalKey | undefined
  // Adds a terminal to the current session and returns its key.
  readonly addTerminal: () => TerminalKey
  readonly startFresh: () => void
  // The backend's sink; undefined before start or after stop.
  readonly dispatch: BackendSink["dispatch"] | undefined
  // The workspace as last committed.
  readonly workspace: () => Workspace | undefined
  // A line for the panel's foot, as "Select a terminal first."
  readonly note: (text: string) => void
}

export type DemoAction = {
  readonly label: string
  // What should appear once it runs.
  readonly hint: string
  readonly run: (context: DemoActionContext) => void | Promise<void>
}

export type DemoActionGroup = {
  readonly title: string
  readonly actions: readonly DemoAction[]
}

// The states half: backend parts that replace or add to the plain demo's, and the
// panel's groups for terminals, agents, notices and folders.
export type DemoStates = {
  readonly groups: readonly DemoActionGroup[]
  readonly agents: NonNullable<Backend["agents"]>
  // Opens the first-run dialog for connecting agents again.
  readonly openWelcome: () => void
  readonly notices: NonNullable<Backend["notices"]>
  readonly pickDirectory: NonNullable<Backend["pickDirectory"]>
  // A fresh shell in place of an ended one, through the backend's sink.
  readonly restart: (key: TerminalKey, dispatch: BackendSink["dispatch"]) => void
  // Always mounted while the demo runs: where `notices.show` puts its notifications.
  readonly Notices: ComponentType
}
