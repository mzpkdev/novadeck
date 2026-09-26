import { createHash, timingSafeEqual } from "node:crypto"

import { contract, errors as contractErrors, protocolVersion } from "@novadeck/protocol"
import { implement, ORPCError } from "@orpc/server"

import { DomainError } from "../errors.js"
import type { TerminalManager } from "../terminals/index.js"
import type { WorkspaceStore } from "../workspaces/store.js"

export type Connection = {
  id: string
  authenticated: boolean
  closed: boolean
  calls: number
  onAuthenticated: () => void
}

type Context = { connection: Connection }

const digest = (value: string): Buffer => createHash("sha256").update(value).digest()

const apiError = (error: unknown): unknown =>
  error instanceof DomainError
    ? new ORPCError(error.code, {
        status: contractErrors[error.code].status,
        message: error.message,
      })
    : error

export const createRouter = (options: {
  token: string
  runtimeId: string
  store: WorkspaceStore
  terminals: TerminalManager
}) => {
  const { store, terminals } = options
  const secret = digest(options.token)
  const api = implement(contract).$context<Context>()
  const protectedApi = api.use(async ({ context, next }) => {
    const connection = context.connection
    if (!connection.authenticated || connection.closed) throw new ORPCError("UNAUTHORIZED")
    if (connection.calls >= 32) throw new ORPCError("RESOURCE_LIMIT", { status: 429 })
    connection.calls += 1
    try {
      return await next()
    } catch (error) {
      throw apiError(error)
    } finally {
      connection.calls -= 1
    }
  })

  return api.router({
    runtime: {
      handshake: api.runtime.handshake.handler(({ input, context, errors }) => {
        const connection = context.connection
        if (connection.closed || !timingSafeEqual(secret, digest(input.token))) {
          throw errors.UNAUTHORIZED()
        }
        if (input.protocolVersion !== protocolVersion) throw errors.INCOMPATIBLE_PROTOCOL()
        connection.authenticated = true
        connection.onAuthenticated()
        return {
          runtimeId: options.runtimeId,
          protocolVersion,
          capabilities: [
            "workspace-metadata",
            "terminal-replay",
            "terminal-ack",
            "terminal-observers",
          ],
        }
      }),
    },
    projects: {
      list: protectedApi.projects.list.handler(() => store.projects()),
      create: protectedApi.projects.create.handler(({ input }) => store.createProject(input)),
      rename: protectedApi.projects.rename.handler(({ input }) => store.renameProject(input)),
    },
    sessions: {
      list: protectedApi.sessions.list.handler(({ input }) => store.sessions(input.projectId)),
      create: protectedApi.sessions.create.handler(({ input }) => store.createSession(input)),
      rename: protectedApi.sessions.rename.handler(({ input }) => store.renameSession(input)),
    },
    terminals: {
      list: protectedApi.terminals.list.handler(({ input }) => {
        store.session(input.sessionId)
        return terminals.list(input.sessionId)
      }),
      create: protectedApi.terminals.create.handler(({ input, context }) => {
        const session = store.session(input.sessionId)
        const project = store.project(session.projectId)
        return terminals.create({ ...input, cwd: input.cwd ?? project.cwd }, context.connection.id)
      }),
      attach: protectedApi.terminals.attach.handler(async function* ({ input, context, signal }) {
        try {
          yield* terminals.attach(
            {
              terminalId: input.terminalId,
              ...(input.afterSequence !== undefined && { afterSequence: input.afterSequence }),
              ...(input.mode !== undefined && { mode: input.mode }),
            },
            context.connection.id,
            signal,
          )
        } catch (error) {
          throw apiError(error)
        }
      }),
      write: protectedApi.terminals.write.handler(({ input, context }) =>
        terminals.write(input, context.connection.id),
      ),
      resize: protectedApi.terminals.resize.handler(({ input, context }) =>
        terminals.resize(input, context.connection.id),
      ),
      ack: protectedApi.terminals.ack.handler(({ input, context }) =>
        terminals.ack(input, context.connection.id),
      ),
      close: protectedApi.terminals.close.handler(({ input, context }) =>
        terminals.close(input, context.connection.id),
      ),
    },
  })
}
