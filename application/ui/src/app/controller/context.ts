import { createContext, useContext, type RefObject } from "react"

import type { Backend } from "../../backend/port"
import type { CanvasHandle } from "../../layouts/canvas/types"
import type { WorkspaceStore } from "../../model/store"
import type { WorkspaceCommands } from "../commands/workspace"
import type { WorkspaceNavigator } from "../routing"
import type { UiStore } from "../ui-store"
import type { WorkspaceController } from "./useWorkspaceController"

// What the provider creates once per App: the backend, both stores, navigation and
// the commands over them.
export type WorkspaceServices = {
  readonly backend: Backend
  readonly workspace: WorkspaceStore
  readonly ui: UiStore
  readonly navigation: WorkspaceNavigator
  readonly commands: WorkspaceCommands
  // The mounted Canvas, for commands that move its camera.
  readonly canvas: RefObject<CanvasHandle | null>
}

export const WorkspaceServicesContext = createContext<WorkspaceServices | null>(null)

export const useWorkspaceServices = (): WorkspaceServices => {
  const services = useContext(WorkspaceServicesContext)
  if (!services) throw new Error("useWorkspaceServices must be used inside a WorkspaceProvider")
  return services
}

// Shares the controller with the app's own sections; feature components keep props.
export const WorkspaceContext = createContext<WorkspaceController | null>(null)

export const useWorkspace = (): WorkspaceController => {
  const controller = useContext(WorkspaceContext)
  if (!controller) throw new Error("useWorkspace must be used inside a WorkspaceContext provider")
  return controller
}
