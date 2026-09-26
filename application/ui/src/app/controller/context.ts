import { createContext, useContext } from "react"

import type { Backend } from "../../backend/port"
import type { WorkspaceStore } from "../../model/store"
import type { UiStore } from "../ui-store"
import type { WorkspaceNavigator } from "./navigator"
import type { WorkspaceController } from "./useWorkspaceController"

// What the provider creates once per App: the backend, both stores, and navigation.
export type WorkspaceServices = {
  readonly backend: Backend
  readonly workspace: WorkspaceStore
  readonly ui: UiStore
  readonly navigation: WorkspaceNavigator
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
