import { QueryClientProvider } from "@tanstack/react-query"
import { createContext, useContext } from "react"

import type { WorkspaceServices } from "../services/workspace-services"

const context = createContext<WorkspaceServices | null>(null)
export const WorkspaceServicesProvider = ({
  services,
  children,
}: {
  services: WorkspaceServices
  children: React.ReactNode
}) => (
  <QueryClientProvider client={services.queryClient}>
    <context.Provider value={services}>{children}</context.Provider>
  </QueryClientProvider>
)
export const useWorkspaceServices = (): WorkspaceServices => {
  const services = useContext(context)
  if (!services) throw new Error("WorkspaceServicesProvider is required")
  return services
}
