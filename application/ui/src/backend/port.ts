import type { ComponentType } from "react"

import type { WorkspaceSeed } from "../model/seed"
import type { WorkspaceAction } from "../model/state"
import type { TerminalMetadata, Workspace, WorkspaceTarget } from "../model/types"

// The UI-owned contract every terminal backend implements. Only app/ talks to it.

export type TerminalKey = WorkspaceTarget & { readonly terminalId: string }

// What a terminal's content area receives; the frame around it stays in terminals/.
export type TerminalSurfaceProps = {
  readonly terminalKey: TerminalKey
  readonly terminal: TerminalMetadata
  readonly projectName: string
  // Undefined when the layout offers no minimize control (Focus).
  readonly minimized?: boolean | undefined
  readonly clipContent?: boolean | undefined
  readonly focusInput: boolean
  readonly onInputFocused: () => void
}

export type Backend = {
  // The workspace to start from, available before the app first renders. It needs at
  // least one project, each with at least one session; mounting throws otherwise.
  readonly seed: WorkspaceSeed
  // Allocates a terminal synchronously so commands can select and rename it at once.
  readonly newTerminal: (input: { number: number; directory: string }) => TerminalMetadata
  // Called inside every workspace store commit, before listeners, and once with []
  // for the initial workspace.
  readonly commit: (workspace: Workspace, actions: readonly WorkspaceAction[]) => void
  // Created once per backend instance so its identity is stable across renders.
  readonly TerminalSurface: ComponentType<TerminalSurfaceProps>
}

// Must be free of side effects: StrictMode may call it twice.
export type CreateBackend = () => Backend
