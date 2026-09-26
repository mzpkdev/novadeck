import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { QueryClient, MutationObserver } from "@tanstack/react-query"
import { matchPath } from "react-router"
import { createStore } from "zustand/vanilla"

import { addCompactGridTerminal } from "../workspace/layouts/grid/placement"
import { createSessionState } from "../workspace/model/state"
import { createWorkspaceStore } from "../workspace/model/store"
import type {
  PreferencesValue,
  Project,
  TerminalMetadata,
  Workspace,
  WorkspaceTarget,
} from "../workspace/model/types"
import { preferencesStorageKey } from "../workspace/preferences/preferences-storage"
import { createTerminalRuntime } from "../workspace/runtime/store"
import { readWindowedView } from "../workspace/shell/shell-storage"
import type { RuntimeConnection } from "./runtime-connection"
import {
  demoMetadataClient,
  liveMetadataClient,
  type MetadataClient,
  type SessionMetadata,
} from "./workspace-metadata"

export type WorkspaceServiceStatus = {
  status: "loading" | "ready" | "empty" | "error"
  error: string | null
  actionError: string | null
  pending: boolean
  emptyReason: "projects" | "sessions" | null
}
const initialStatus: WorkspaceServiceStatus = {
  status: "loading",
  error: null,
  actionError: null,
  pending: false,
  emptyReason: null,
}

export const createWorkspaceServices = (options: {
  mode: "demo" | "live"
  preferences: PreferencesValue
  connection?: RuntimeConnection
  metadataClient?: MetadataClient
}) => {
  if (options.mode === "live" && !options.connection && !options.metadataClient)
    throw new Error("Live workspace requires a runtime connection")
  const demo = options.mode === "demo" ? demoMetadataClient(options.preferences) : null
  const client =
    options.metadataClient ??
    demo?.client ??
    liveMetadataClient(() => options.connection!.getClient())
  const queries = createTanstackQueryUtils(client)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
  const preferencesStore = createStore<PreferencesValue>(() => options.preferences)
  const unsubscribePreferences = preferencesStore.subscribe((value) => {
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(value))
    } catch {
      /* Apply without persistence when storage is unavailable. */
    }
  })
  const statusStore = createStore<WorkspaceServiceStatus>(() => initialStatus)
  const projectKey = queries.projects.list.queryKey()
  const sessionsKey = (projectId: string) =>
    queries.sessions.list.queryKey({ input: { projectId } })
  const terminalsKey = (target: WorkspaceTarget) =>
    queries.terminals.list.queryKey({
      input: { projectId: target.projectId, sessionId: target.workspaceSessionId },
    })
  let activeProjectId = demo?.seed.activeProjectId ?? ""
  let routePath = "/"
  let loadIdentity = 0
  let disposed = false
  let mutating = 0
  let runtimeId = options.connection?.store.getState().runtimeId ?? null
  const metadata = (): Workspace => {
    const projects = queryClient.getQueryData<Project[]>(projectKey) ?? []
    return {
      activeProjectId: projects.some((project) => project.id === activeProjectId)
        ? activeProjectId
        : (projects[0]?.id ?? ""),
      projects: projects.map((project) => {
        const history = (
          queryClient.getQueryData<SessionMetadata[]>(sessionsKey(project.id)) ?? []
        ).map((session) => {
          const terminals = (
            queryClient.getQueryData<TerminalMetadata[]>(
              terminalsKey({ projectId: project.id, workspaceSessionId: session.id }),
            ) ?? []
          ).map((terminal, index) =>
            terminal.name === "Terminal"
              ? { ...terminal, name: `Terminal ${String(index + 1).padStart(2, "0")}` }
              : terminal,
          )
          const seeded = demo?.seed.projects
            .find((item) => item.id === project.id)
            ?.history.find((item) => item.id === session.id)
          return {
            id: session.id,
            name: session.name,
            visitedAt: seeded?.visitedAt ?? 0,
            state: seeded
              ? { ...seeded.state, sessions: terminals }
              : createSessionState(
                  terminals,
                  options.preferences.enabledViews[0]!,
                  readWindowedView(),
                ),
          }
        })
        return { ...project, activeSessionId: history[0]?.id ?? "", history }
      }),
    }
  }
  if (demo) {
    queryClient.setQueryData(
      projectKey,
      demo.seed.projects.map(({ id, name, directory }) => ({ id, name, directory })),
    )
    for (const project of demo.seed.projects) {
      queryClient.setQueryData(
        sessionsKey(project.id),
        project.history.map(({ id, name }) => ({ id, name, projectId: project.id })),
      )
      for (const session of project.history)
        queryClient.setQueryData(
          terminalsKey({ projectId: project.id, workspaceSessionId: session.id }),
          session.state.sessions,
        )
    }
  }
  const runtime = createTerminalRuntime(metadata())
  const workspaceStore = createWorkspaceStore(
    metadata(),
    (next, actions) =>
      runtime.reconcile(
        next,
        actions.flatMap((action) =>
          action.type === "terminal/add"
            ? [{ ...action.target, terminalId: action.session.id }]
            : [],
        ),
      ),
    metadata,
  )
  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success")
      workspaceStore.refreshMetadata()
  })
  const reportError = (_error: unknown): void =>
    statusStore.setState({
      actionError: "The workspace command failed. Check the runtime connection and try again.",
    })
  const clearError = (): void => statusStore.setState({ actionError: null })
  const mutation = async <Output>(
    run: (assertCurrent: () => void) => Promise<Output>,
  ): Promise<Output> => {
    const generation = options.connection?.store.getState().generation
    const assertCurrent = (): void => {
      if (disposed || generation !== options.connection?.store.getState().generation)
        throw new Error("Runtime changed while the command was pending")
    }
    mutating++
    statusStore.setState({ pending: true, actionError: null })
    // An uncertain shell creation/close is never automatically repeated.
    const observer = new MutationObserver<Output, Error, void>(queryClient, {
      mutationFn: () => run(assertCurrent),
      retry: false,
    })
    try {
      return await observer.mutate()
    } catch (error) {
      reportError(error)
      throw error
    } finally {
      statusStore.setState({ pending: --mutating > 0 })
    }
  }
  const loadRoute = async (pathname: string): Promise<void> => {
    routePath = pathname
    const identity = ++loadIdentity
    const requestedRoute = matchPath(
      "/projects/:projectId/sessions/:sessionId/:view",
      pathname,
    )?.params
    const cachedProjects = queryClient.getQueryData<Project[]>(projectKey)
    const cachedProject =
      cachedProjects?.find((project) => project.id === requestedRoute?.projectId) ??
      cachedProjects?.find((project) => project.id === activeProjectId) ??
      cachedProjects?.[0]
    const cachedSessions = cachedProject
      ? queryClient.getQueryData<SessionMetadata[]>(sessionsKey(cachedProject.id))
      : undefined
    const cachedSession =
      cachedSessions?.find((session) => session.id === requestedRoute?.sessionId) ??
      cachedSessions?.[0]
    const cachedTerminals =
      cachedProject && cachedSession
        ? queryClient.getQueryData(
            terminalsKey({ projectId: cachedProject.id, workspaceSessionId: cachedSession.id }),
          )
        : undefined
    if (!cachedProjects || !cachedSessions || !cachedTerminals)
      statusStore.setState({ status: "loading", error: null })
    try {
      const projects = await queryClient.fetchQuery(queries.projects.list.queryOptions())
      if (disposed || identity !== loadIdentity) return
      if (!projects.length) {
        statusStore.setState({ status: "empty", emptyReason: "projects" })
        return
      }
      const requested = matchPath(
        "/projects/:projectId/sessions/:sessionId/:view",
        pathname,
      )?.params
      const project =
        projects.find((item) => item.id === requested?.projectId) ??
        projects.find((item) => item.id === activeProjectId) ??
        projects[0]!
      activeProjectId = project.id
      const sessions = await queryClient.fetchQuery(
        queries.sessions.list.queryOptions({ input: { projectId: project.id } }),
      )
      if (disposed || identity !== loadIdentity) return
      workspaceStore.refreshMetadata()
      if (!sessions.length) {
        statusStore.setState({ status: "empty", emptyReason: "sessions" })
        return
      }
      const remembered = workspaceStore
        .getSnapshot()
        .projects.find((item) => item.id === project.id)?.activeSessionId
      const session =
        sessions.find((item) => item.id === requested?.sessionId) ??
        sessions.find((item) => item.id === remembered) ??
        sessions[0]!
      await queryClient.fetchQuery(
        queries.terminals.list.queryOptions({
          input: { projectId: project.id, sessionId: session.id },
        }),
      )
      if (disposed || identity !== loadIdentity) return
      const selectedSession = workspaceStore
        .getSnapshot()
        .projects.find((item) => item.id === project.id)
        ?.history.find((item) => item.id === session.id)
      if (selectedSession?.visitedAt === 0 && selectedSession.state.sessions[0])
        workspaceStore.dispatch({
          type: "terminal/select",
          target: { projectId: project.id, workspaceSessionId: session.id },
          terminalId: selectedSession.state.sessions[0].id,
        })
      workspaceStore.transact([
        { type: "project/select", projectId: project.id, now: Date.now() },
        {
          type: "session/select",
          projectId: project.id,
          workspaceSessionId: session.id,
          now: Date.now(),
        },
      ])
      statusStore.setState({ status: "ready", error: null, emptyReason: null })
    } catch {
      if (disposed || identity !== loadIdentity) return
      statusStore.setState({
        status: "error",
        error: "Could not load the workspace. Check the runtime connection and try again.",
      })
    }
  }
  const preload = async (projectId: string, sessionId?: string): Promise<boolean> => {
    const identity = ++loadIdentity
    try {
      const sessions = await queryClient.fetchQuery(
        queries.sessions.list.queryOptions({ input: { projectId } }),
      )
      if (disposed || identity !== loadIdentity) return false
      if (!sessions.length) {
        activeProjectId = projectId
        statusStore.setState({ status: "empty", emptyReason: "sessions" })
        return true
      }
      const remembered = workspaceStore
        .getSnapshot()
        .projects.find((project) => project.id === projectId)?.activeSessionId
      const session =
        sessions.find((item) => item.id === sessionId) ??
        sessions.find((item) => item.id === remembered) ??
        sessions[0]!
      await queryClient.fetchQuery(
        queries.terminals.list.queryOptions({ input: { projectId, sessionId: session.id } }),
      )
      if (disposed || identity !== loadIdentity) return false
      workspaceStore.refreshMetadata()
      return true
    } catch (error) {
      if (disposed || identity !== loadIdentity) return false
      reportError(error)
      throw error
    }
  }
  const selectProject = (projectId: string): Promise<boolean> => preload(projectId)
  const selectSession = (target: WorkspaceTarget): Promise<boolean> =>
    preload(target.projectId, target.workspaceSessionId)
  const createProject = async (input: { name: string; cwd: string }): Promise<Project> =>
    mutation(async (assertCurrent) => {
      const project = await client.projects.create(input)
      assertCurrent()
      queryClient.setQueryData<Project[]>(projectKey, (previous = []) => [...previous, project])
      activeProjectId = project.id
      workspaceStore.refreshMetadata()
      return project
    })
  const createSession = async (projectId: string, name: string): Promise<SessionMetadata> =>
    mutation(async (assertCurrent) => {
      const session = await client.sessions.create({ projectId, name })
      assertCurrent()
      queryClient.setQueryData<SessionMetadata[]>(sessionsKey(projectId), (previous = []) => [
        session,
        ...previous,
      ])
      queryClient.setQueryData(terminalsKey({ projectId, workspaceSessionId: session.id }), [])
      workspaceStore.refreshMetadata()
      return session
    })
  const createTerminal = async (
    target: WorkspaceTarget,
    beforePublish?: (terminal: TerminalMetadata) => void,
  ): Promise<TerminalMetadata> =>
    mutation(async (assertCurrent) => {
      const project = workspaceStore
        .getSnapshot()
        .projects.find((item) => item.id === target.projectId)
      if (!project) throw new Error("Project is no longer available")
      const terminal = await client.terminals.create({
        projectId: target.projectId,
        sessionId: target.workspaceSessionId,
        cwd: project.directory,
        cols: 80,
        rows: 24,
      })
      assertCurrent()
      beforePublish?.(terminal)
      const previous = workspaceStore
        .getSnapshot()
        .projects.find((item) => item.id === target.projectId)
        ?.history.find((session) => session.id === target.workspaceSessionId)?.state
      workspaceStore.dispatch({
        type: "terminal/add",
        target,
        session: terminal,
        ...(previous
          ? {
              gridLayouts: addCompactGridTerminal(
                previous.sessions,
                previous.gridLayouts,
                terminal,
              ),
            }
          : {}),
      })
      queryClient.setQueryData<TerminalMetadata[]>(terminalsKey(target), (cached = []) => [
        ...cached.filter((item) => item.id !== terminal.id),
        terminal,
      ])
      runtime.reconcile(workspaceStore.getSnapshot(), [{ ...target, terminalId: terminal.id }])
      return (
        workspaceStore
          .getSnapshot()
          .projects.find((item) => item.id === target.projectId)
          ?.history.find((session) => session.id === target.workspaceSessionId)
          ?.state.sessions.find((item) => item.id === terminal.id) ?? terminal
      )
    })
  const closeTerminal = async (target: WorkspaceTarget, terminalId: string): Promise<void> =>
    mutation(async (assertCurrent) => {
      await client.terminals.close({
        projectId: target.projectId,
        sessionId: target.workspaceSessionId,
        terminalId,
      })
      assertCurrent()
      // Exited terminals remain in backend discovery; dismiss only after confirmed close.
      workspaceStore.dispatch({ type: "terminal/close", target, terminalId })
    })
  const recordTerminalExit = (terminalId: string, _exitCode: number | null): void => {
    if (disposed) return
    for (const query of queryClient
      .getQueryCache()
      .findAll({ queryKey: queries.terminals.list.key() })) {
      queryClient.setQueryData<TerminalMetadata[]>(query.queryKey, (terminals) => {
        if (
          !terminals?.some(
            (terminal) => terminal.id === terminalId && terminal.state !== "finished",
          )
        )
          return terminals
        return terminals.map((terminal) =>
          terminal.id === terminalId ? { ...terminal, state: "finished" } : terminal,
        )
      })
    }
  }
  const unsubscribeConnection = options.connection?.store.subscribe((next, previous) => {
    if (next.status !== "connected" || next.generation === previous.generation) return
    if (runtimeId !== next.runtimeId) {
      runtimeId = next.runtimeId
      queryClient.clear()
    } else void queryClient.invalidateQueries({ refetchType: "none" })
    // The router gate reloads its current path for this generation.
  })
  return {
    mode: options.mode,
    queryClient,
    queries,
    workspaceStore,
    runtime,
    statusStore,
    preferencesStore,
    getProjects: () => workspaceStore.getSnapshot().projects,
    getCurrentProject: () => {
      const workspace = workspaceStore.getSnapshot()
      const currentId =
        statusStore.getState().status === "empty" ? activeProjectId : workspace.activeProjectId
      return workspace.projects.find((project) => project.id === currentId)
    },
    loadRoute,
    selectProject,
    selectSession,
    createProject,
    createSession,
    createTerminal,
    closeTerminal,
    recordTerminalExit,
    reportError,
    clearError,
    refresh: () => {
      void queryClient.invalidateQueries({ refetchType: "none" })
      return loadRoute(routePath)
    },
    dispose: () => {
      disposed = true
      loadIdentity++
      unsubscribeConnection?.()
      unsubscribeCache()
      unsubscribePreferences()
      queryClient.clear()
    },
  }
}
export type WorkspaceServices = ReturnType<typeof createWorkspaceServices>
