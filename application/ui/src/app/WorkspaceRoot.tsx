import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { HashRouter, matchPath, useLocation, useNavigate } from "react-router"
import { useStore } from "zustand"

import { createRuntimeConnection } from "../services/runtime-connection"
import { runtimeEndpoint } from "../services/runtime-endpoint"
import { createWorkspaceServices } from "../services/workspace-services"
import { readPreferences } from "../workspace/preferences/preferences-storage"
import {
  createLiveTerminalRuntime,
  type LiveTerminalRuntime,
} from "../workspace/runtime/live/runtime"
import { ConnectionScreen, StartupPanel } from "./ConnectionScreen"
import { WorkspaceServicesProvider } from "./workspace-services"
import { WorkspaceSetup } from "./WorkspaceSetup"

export type WorkspaceMode = "demo" | "live"
type Environment = {
  mode: WorkspaceMode
  terminals: LiveTerminalRuntime | null
  openProject: () => void
}
const environmentContext = createContext<Environment | null>(null)
export const useWorkspaceEnvironment = (): Environment => {
  const environment = useContext(environmentContext)
  if (!environment) throw new Error("WorkspaceRoot is required")
  return environment
}
const createResources = (mode: WorkspaceMode) => {
  const connection = createRuntimeConnection()
  const services = createWorkspaceServices({ mode, connection, preferences: readPreferences() })
  const terminals =
    mode === "live"
      ? createLiveTerminalRuntime(connection, { onTerminalExit: services.recordTerminalExit })
      : null
  return { mode, connection, services, terminals }
}
type Resources = ReturnType<typeof createResources>

export const WorkspaceRoot = ({
  mode,
  children,
}: {
  mode: WorkspaceMode
  children: ReactNode
}): React.JSX.Element => {
  const [resources] = useState(() => createResources(mode))
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // StrictMode re-runs effects on the same app instance; only final unmount
      // owns disposal of sockets, query subscriptions and terminal emulators.
      queueMicrotask(() => {
        if (mounted.current) return
        resources.terminals?.dispose()
        resources.services.dispose()
        resources.connection.dispose()
      })
    }
  }, [resources])
  return (
    <WorkspaceServicesProvider services={resources.services}>
      <HashRouter useTransitions={false}>
        <WorkspaceGate resources={resources}>{children}</WorkspaceGate>
      </HashRouter>
    </WorkspaceServicesProvider>
  )
}

const WorkspaceGate = ({
  resources,
  children,
}: {
  resources: Resources
  children: ReactNode
}): React.JSX.Element => {
  const { mode, connection, services, terminals } = resources
  const state = useStore(connection.store)
  const status = useStore(services.statusStore)
  const location = useLocation()
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<string | null>(null)
  const requested = matchPath(
    "/projects/:projectId/sessions/:sessionId/:view",
    location.pathname,
  )?.params
  const routeIdentity = `${requested?.projectId ?? ""}/${requested?.sessionId ?? ""}`
  const desktop = Boolean(window.novadeck?.getRuntimeConnection)
  const endpoint = import.meta.env.VITE_API_URL || "/api"
  const canLoad = mode === "demo" || state.status === "connected"
  const loadRoute = useEffectEvent(() => services.loadRoute(location.pathname))
  const environment = useMemo(
    () => ({
      mode,
      terminals,
      openProject: () => {
        services.clearError()
        setOpening(true)
      },
    }),
    [mode, terminals, services],
  )

  const connect = async (token: string): Promise<void> => {
    setConnectionError(null)
    try {
      const options = window.novadeck?.getRuntimeConnection
        ? await window.novadeck.getRuntimeConnection()
        : { url: runtimeEndpoint(endpoint, window.location.href), token }
      await connection.connect(options)
    } catch {
      setConnectionError("Could not connect. Check the server address and access token.")
    }
  }
  useEffect(() => {
    if (mode !== "live" || !desktop) return
    let active = true
    void window.novadeck!.getRuntimeConnection!()
      .then((options) => {
        if (active) return connection.connect(options)
      })
      .catch(() => {
        if (active) setConnectionError("Could not start the local runtime. Retry the connection.")
      })
    return () => {
      active = false
    }
  }, [connection, desktop, mode])

  useEffect(() => {
    if (!canLoad) return
    let active = true
    const generation = state.generation
    void loadRoute().then(() => {
      if (active && connection.store.getState().generation === generation) setLoaded(routeIdentity)
    })
    return () => {
      active = false
    }
  }, [canLoad, connection, state.generation, routeIdentity])

  if (mode === "live" && !canLoad && state.status !== "reconnecting")
    return (
      <ConnectionScreen
        state={state}
        endpoint={endpoint}
        desktop={desktop}
        onConnect={connect}
        error={connectionError}
      />
    )

  const current = services.getCurrentProject()
  const matches =
    requested?.projectId === current?.id && requested?.sessionId === current?.activeSessionId
  const ready = status.status === "ready" && (loaded === routeIdentity || matches)
  const created = (projectId: string, sessionId: string): void => {
    setOpening(false)
    const view = services.preferencesStore.getState().enabledViews[0] ?? "focus"
    void navigate(
      `/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/${view}`,
    )
  }
  if (opening || (status.status === "empty" && loaded === routeIdentity))
    return (
      <WorkspaceSetup
        services={services}
        onCreated={created}
        {...(opening ? { onCancel: () => setOpening(false) } : {})}
      />
    )
  if (status.status === "error")
    return (
      <StartupPanel title="Workspace unavailable">
        <p role="alert" className="mb-4 text-sm leading-6 text-muted">
          {status.error}
        </p>
        <button
          className="small-button"
          onClick={() => {
            void services.refresh()
          }}
        >
          Reload workspace
        </button>
      </StartupPanel>
    )
  if (!ready)
    return (
      <StartupPanel title="Loading your workspace">
        <p role="status" className="text-sm text-muted">
          Loading projects and sessions…
        </p>
      </StartupPanel>
    )
  return (
    <environmentContext.Provider value={environment}>
      {children}
      {(status.actionError || state.status === "reconnecting") && (
        <div
          className="fixed inset-x-4 bottom-9 z-50 flex items-center justify-between gap-4 rounded-control border border-line bg-paper px-4 py-3 text-sm shadow-panel"
          role={status.actionError ? "alert" : "status"}
        >
          <span>{status.actionError ?? "Runtime connection lost. Reconnecting…"}</span>
          {status.actionError && (
            <button className="small-button" onClick={services.clearError}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </environmentContext.Provider>
  )
}
