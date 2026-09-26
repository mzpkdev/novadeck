import type { RuntimeClient, TerminalSummary } from "@novadeck/protocol"

import { initializeWorkspace, newWorkspaceSession } from "../app/demo-workspace"
import { createMockTerminal } from "../workspace/mock/sessions"
import type {
  PreferencesValue,
  Project,
  TerminalMetadata,
  WorkspaceSession,
} from "../workspace/model/types"

export type SessionMetadata = { id: string; projectId: string; name: string }
export type MetadataClient = {
  projects: {
    list: () => Promise<Project[]>
    create: (input: { name: string; cwd: string }) => Promise<Project>
  }
  sessions: {
    list: (input: { projectId: string }) => Promise<SessionMetadata[]>
    create: (input: { projectId: string; name: string }) => Promise<SessionMetadata>
  }
  terminals: {
    list: (input: { sessionId: string; projectId: string }) => Promise<TerminalMetadata[]>
    create: (input: {
      sessionId: string
      projectId: string
      cwd: string
      cols: number
      rows: number
    }) => Promise<TerminalMetadata>
    close: (input: { terminalId: string; sessionId: string; projectId: string }) => Promise<void>
  }
}

export const terminalMetadata = (terminal: TerminalSummary): TerminalMetadata => ({
  id: terminal.id,
  name: "Terminal",
  directory: terminal.cwd,
  command: "",
  process: "shell",
  state: terminal.status === "running" ? "running" : "finished",
  kind: "shell",
})

export const liveMetadataClient = (getClient: () => RuntimeClient): MetadataClient => ({
  projects: {
    list: async () =>
      (await getClient().projects.list()).map(({ cwd, ...project }) => ({
        ...project,
        directory: cwd,
      })),
    create: async (input) => {
      const { cwd, ...project } = await getClient().projects.create(input)
      return { ...project, directory: cwd }
    },
  },
  sessions: {
    list: (input) => getClient().sessions.list(input),
    create: (input) => getClient().sessions.create(input),
  },
  terminals: {
    list: async (input) =>
      (await getClient().terminals.list({ sessionId: input.sessionId })).map(terminalMetadata),
    create: async (input) =>
      terminalMetadata(
        await getClient().terminals.create({
          sessionId: input.sessionId,
          cwd: input.cwd,
          cols: input.cols,
          rows: input.rows,
        }),
      ),
    close: (input) => getClient().terminals.close({ terminalId: input.terminalId }),
  },
})

export const demoMetadataClient = (preferences: PreferencesValue) => {
  const seed = initializeWorkspace(preferences)
  // This adapter is the explicit demo server; application metadata still comes from Query.
  const projects = seed.projects.map(({ id, name, directory }) => ({ id, name, directory }))
  const sessions = seed.projects.flatMap((project) =>
    project.history.map(({ id, name }) => ({ id, name, projectId: project.id })),
  )
  const terminals = new Map<string, TerminalMetadata[]>(
    seed.projects.flatMap((project) =>
      project.history.map(
        (session) => [`${project.id}/${session.id}`, session.state.sessions] as const,
      ),
    ),
  )
  const counters = new Map([...terminals].map(([key, values]) => [key, values.length + 1]))
  const sessionKey = (sessionId: string, projectId?: string): string =>
    projectId
      ? `${projectId}/${sessionId}`
      : ([...terminals.keys()].find((key) => key.endsWith(`/${sessionId}`)) ?? sessionId)
  const client: MetadataClient = {
    projects: {
      list: async () => [...projects],
      create: async ({ name, cwd }) => {
        const project = { id: crypto.randomUUID(), name, directory: cwd }
        projects.push(project)
        return project
      },
    },
    sessions: {
      list: async ({ projectId }) => sessions.filter((session) => session.projectId === projectId),
      create: async ({ projectId, name }) => {
        const session = { id: crypto.randomUUID(), projectId, name }
        sessions.unshift(session)
        terminals.set(sessionKey(session.id, projectId), [])
        return session
      },
    },
    terminals: {
      list: async ({ sessionId, projectId }) => [
        ...(terminals.get(sessionKey(sessionId, projectId)) ?? []),
      ],
      create: async ({ sessionId, projectId, cwd }) => {
        const key = sessionKey(sessionId, projectId)
        const previous = terminals.get(key) ?? []
        const number = counters.get(key) ?? 1
        counters.set(key, number + 1)
        const terminal = createMockTerminal(number, cwd)
        terminals.set(key, [...previous, terminal])
        return terminal
      },
      close: async ({ terminalId, sessionId, projectId }) => {
        const key = sessionKey(sessionId, projectId)
        terminals.set(
          key,
          (terminals.get(key) ?? []).filter((terminal) => terminal.id !== terminalId),
        )
      },
    },
  }
  return { client, seed }
}

export const sessionPresentationSeed = (preferences: PreferencesValue): WorkspaceSession =>
  newWorkspaceSession([], preferences.enabledViews[0]!, "grid")
