import { describe, expect, it } from "vitest"
import { createStore } from "zustand/vanilla"

import type { TerminalMetadata } from "../workspace/model/types"
import type { ConnectionSnapshot, RuntimeConnection } from "./runtime-connection"
import type { MetadataClient } from "./workspace-metadata"
import { createWorkspaceServices } from "./workspace-services"

const preferences = {
  fontSize: 13,
  enabledViews: ["focus", "grid", "canvas"] as ("focus" | "grid" | "canvas")[],
}
const project = { id: "project", name: "Project", directory: "/tmp" }
const session = { id: "session", projectId: project.id, name: "Session" }
const terminal: TerminalMetadata = {
  id: "terminal",
  name: "Terminal",
  directory: "/tmp",
  command: "",
  process: "shell",
  state: "running",
  kind: "shell",
}
const target = { projectId: project.id, workspaceSessionId: session.id }
const deferred = <Value>() => {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const fixture = (
  overrides: {
    terminals?: Partial<MetadataClient["terminals"]>
    sessions?: Partial<MetadataClient["sessions"]>
  } = {},
) => {
  let creates = 0
  let closes = 0
  const client: MetadataClient = {
    projects: { list: async () => [project], create: async () => project },
    sessions: { list: async () => [session], create: async () => session, ...overrides.sessions },
    terminals: {
      list: async () => [terminal],
      create: async () => {
        creates++
        throw new Error("Disconnected after request")
      },
      close: async () => {
        closes++
        throw new Error("Control required")
      },
      ...overrides.terminals,
    },
  }
  const services = createWorkspaceServices({ mode: "live", preferences, metadataClient: client })
  const current = () => services.workspaceStore.getSnapshot().projects[0]!.history[0]!.state
  return { services, current, counts: () => ({ creates, closes }) }
}

describe("workspace metadata ownership", () => {
  it("does not replace a newer route with an obsolete empty-project preload", async () => {
    const empty = deferred<import("./workspace-metadata").SessionMetadata[]>()
    const second = { ...project, id: "other" }
    const services = createWorkspaceServices({
      mode: "live",
      preferences,
      metadataClient: {
        projects: { list: async () => [project, second], create: async () => project },
        sessions: {
          list: ({ projectId }) =>
            projectId === second.id ? empty.promise : Promise.resolve([session]),
          create: async () => session,
        },
        terminals: {
          list: async () => [terminal],
          create: async () => terminal,
          close: async () => undefined,
        },
      },
    })
    await services.loadRoute("/projects/project/sessions/session/focus")
    const pending = services.selectProject(second.id)
    await services.loadRoute("/projects/project/sessions/session/canvas")
    empty.resolve([])
    expect(await pending).toBe(false)
    expect(services.statusStore.getState().status).toBe("ready")
    expect(services.getCurrentProject()?.id).toBe(project.id)
    services.dispose()
  })

  it("projects natural process exit from the stream into cached metadata while retaining aliases", async () => {
    const { services, current } = fixture()
    await services.loadRoute("/projects/project/sessions/session/focus")
    services.workspaceStore.dispatch({
      type: "terminal/rename",
      target,
      terminalId: terminal.id,
      name: "Server",
    })
    services.recordTerminalExit(terminal.id, 0)
    expect(current().sessions[0]).toMatchObject({ name: "Server", state: "finished" })
    expect(
      services.queryClient.getQueryData(
        services.queries.terminals.list.queryKey({
          input: { projectId: project.id, sessionId: session.id },
        }),
      ),
    ).toEqual([{ ...terminal, state: "finished" }])
    services.dispose()
  })

  it("rejects late mutation results from a replaced runtime without inserting stale terminals", async () => {
    const result = deferred<TerminalMetadata>()
    const connection: RuntimeConnection = {
      store: createStore<ConnectionSnapshot>(() => ({
        status: "connected",
        runtimeId: "first",
        error: null,
        generation: 1,
      })),
      getClient: () => {
        throw new Error("Test uses explicit metadata adapter")
      },
      connect: async () => undefined,
      disconnect: () => undefined,
      dispose: () => undefined,
    }
    const services = createWorkspaceServices({
      mode: "live",
      preferences,
      connection,
      metadataClient: {
        projects: { list: async () => [project], create: async () => project },
        sessions: { list: async () => [session], create: async () => session },
        terminals: {
          list: async () => [terminal],
          create: () => result.promise,
          close: async () => undefined,
        },
      },
    })
    await services.loadRoute("/projects/project/sessions/session/focus")
    const pending = services.createTerminal(target)
    connection.store.setState({ generation: 2, runtimeId: "second" })
    result.resolve({ ...terminal, id: "obsolete" })
    await expect(pending).rejects.toThrow("Runtime changed")
    expect(
      services.queryClient.getQueryData(
        services.queries.terminals.list.queryKey({
          input: { projectId: project.id, sessionId: session.id },
        }),
      ),
    ).toBeUndefined()
    services.dispose()
  })

  it("keeps explicit demo projects isolated and initializes newly created terminals blank", async () => {
    const services = createWorkspaceServices({ mode: "demo", preferences })
    await services.loadRoute("/")
    const workspace = services.workspaceStore.getSnapshot()
    const first = workspace.projects[0]!
    const second = workspace.projects[1]!
    const demoTarget = { projectId: first.id, workspaceSessionId: first.activeSessionId }
    const created = await services.createTerminal(demoTarget)
    expect(created.name).toBe("Terminal 07")
    expect(services.runtime.getSnapshot({ ...demoTarget, terminalId: created.id }).cleared).toBe(
      true,
    )
    await services.closeTerminal(demoTarget, "01")
    const other = services.workspaceStore
      .getSnapshot()
      .projects.find((item) => item.id === second.id)!
    expect(other.history[0]!.state.sessions.some((item) => item.id === "01")).toBe(true)
    services.dispose()
  })

  it("waits for the requested session and terminal metadata before resolving a deep link", async () => {
    const result = deferred<TerminalMetadata[]>()
    const { services } = fixture({ terminals: { list: () => result.promise } })
    const pending = services.loadRoute("/projects/project/sessions/session/canvas")
    await Promise.resolve()
    expect(services.statusStore.getState().status).toBe("loading")
    result.resolve([terminal])
    await pending
    expect(services.statusStore.getState().status).toBe("ready")
    expect(services.workspaceStore.getSnapshot().projects[0]!.history[0]!.id).toBe("session")
    services.dispose()
  })

  it("retains client aliases and layouts while refreshed metadata changes process status", async () => {
    const { services, current } = fixture()
    await services.loadRoute("/projects/project/sessions/session/focus")
    services.workspaceStore.transact([
      { type: "terminal/rename", target, terminalId: terminal.id, name: "Server" },
      { type: "terminal/visibility", target, terminalId: terminal.id, hidden: true },
    ])
    services.queryClient.setQueryData(
      services.queries.terminals.list.queryKey({
        input: { projectId: project.id, sessionId: session.id },
      }),
      [{ ...terminal, state: "finished" }],
    )
    expect(current().sessions[0]).toMatchObject({ name: "Server", state: "finished" })
    expect(current().hidden[terminal.id]).toBe(true)
    expect(
      services.workspaceStore.presentation.getState().sessions["project/session"],
    ).not.toHaveProperty("sessions")
    services.dispose()
  })

  it("never retries uncertain creation or hides a terminal after a failed close", async () => {
    const { services, current, counts } = fixture()
    await services.loadRoute("/projects/project/sessions/session/focus")
    await expect(services.createTerminal(target)).rejects.toThrow("Disconnected")
    await expect(services.closeTerminal(target, terminal.id)).rejects.toThrow("Control")
    expect(counts()).toEqual({ creates: 1, closes: 1 })
    expect(current().sessions.map((item) => item.id)).toEqual([terminal.id])
    expect(services.statusStore.getState()).toMatchObject({
      status: "ready",
      pending: false,
      actionError: expect.any(String),
    })
    services.dispose()
  })

  it("dismisses a successfully closed terminal even when discovery retains the exited summary", async () => {
    const { services, current } = fixture({ terminals: { close: async () => undefined } })
    await services.loadRoute("/projects/project/sessions/session/focus")
    await services.closeTerminal(target, terminal.id)
    services.queryClient.setQueryData(
      services.queries.terminals.list.queryKey({
        input: { projectId: project.id, sessionId: session.id },
      }),
      [{ ...terminal, state: "finished" }],
    )
    expect(current().sessions).toEqual([])
    expect(current().selected).toBe("")
    services.dispose()
  })

  it("creates client geometry only after the server confirms creation", async () => {
    const result = deferred<TerminalMetadata>()
    const { services, current } = fixture({ terminals: { create: () => result.promise } })
    await services.loadRoute("/projects/project/sessions/session/focus")
    const pending = services.createTerminal(target)
    expect(current().sessions).toHaveLength(1)
    result.resolve({ ...terminal, id: "created" })
    await pending
    expect(current().sessions).toHaveLength(2)
    expect(current().selected).toBe("created")
    expect(current().canvasLayout.geometry.created).toMatchObject({ width: 600, height: 400 })
    services.dispose()
  })

  it("keeps cached navigation mounted and reports empty onboarding explicitly", async () => {
    const { services } = fixture()
    await services.loadRoute("/projects/project/sessions/session/focus")
    const statuses: string[] = []
    const unsubscribe = services.statusStore.subscribe((state) => statuses.push(state.status))
    await services.loadRoute("/projects/project/sessions/session/canvas")
    expect(statuses).not.toContain("loading")
    unsubscribe()
    services.dispose()
    const empty = createWorkspaceServices({
      mode: "live",
      preferences,
      metadataClient: {
        projects: { list: async () => [], create: async () => project },
        sessions: { list: async () => [], create: async () => session },
        terminals: {
          list: async () => [],
          create: async () => terminal,
          close: async () => undefined,
        },
      },
    })
    await empty.loadRoute("/")
    expect(empty.statusStore.getState()).toMatchObject({ status: "empty", emptyReason: "projects" })
    empty.dispose()
  })
})
