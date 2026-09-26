import { createContext, useContext } from "react"

import type { WorkspaceController } from "./useWorkspaceController"

// Shares the controller with the app's own sections; feature components keep props.
export const WorkspaceContext = createContext<WorkspaceController | null>(null)

export const useWorkspace = (): WorkspaceController => {
  const controller = useContext(WorkspaceContext)
  if (!controller) throw new Error("useWorkspace must be used inside a WorkspaceContext provider")
  return controller
}
