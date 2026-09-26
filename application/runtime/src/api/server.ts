import { randomUUID } from "node:crypto"
import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"

import type { ServerType } from "@hono/node-server"
import { RPCHandler } from "@orpc/server/ws"
import { WebSocket, WebSocketServer } from "ws"

import { TerminalManager, type TerminalManagerOptions } from "../terminals/index.js"
import { WorkspaceStore } from "../workspaces/store.js"
import { createRouter, type Connection } from "./router.js"

export type ApiOptions = {
  token: string
  origins: readonly string[]
  databasePath?: string
  terminal?: TerminalManagerOptions
  maxConnections?: number
  heartbeatIntervalMs?: number
}

const rejectUpgrade = (socket: Duplex, status: number, message: string): void => {
  socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

export const createApi = (options: ApiOptions) => {
  if (options.token.length < 32 || options.token.length > 512) {
    throw new Error("NOVADECK_TOKEN must contain between 32 and 512 characters")
  }
  const maxConnections = options.maxConnections ?? 32
  if (!Number.isSafeInteger(maxConnections) || maxConnections < 1) {
    throw new Error("maxConnections must be a positive integer")
  }
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000
  if (!Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1) {
    throw new Error("heartbeatIntervalMs must be a positive integer")
  }
  const terminals = new TerminalManager(options.terminal)
  const transportBudget = (options.terminal?.snapshotBytes ?? 32 * 1024 * 1024) + 8 * 1024 * 1024
  const store = new WorkspaceStore(options.databasePath)
  const handler = new RPCHandler(
    createRouter({ token: options.token, runtimeId: randomUUID(), terminals, store }),
  )
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  })
  let stopping = false
  let stop: Promise<void> | undefined
  let server: ServerType | undefined

  wss.on("connection", (socket) => {
    const timer = setTimeout(() => socket.close(1008, "Authentication required"), 10_000)
    timer.unref()
    let heartbeat: ReturnType<typeof setInterval> | undefined
    const connection: Connection = {
      id: randomUUID(),
      authenticated: false,
      closed: false,
      calls: 0,
      onAuthenticated: () => clearTimeout(timer),
    }
    const cleanup = () => {
      if (connection.closed) return
      connection.closed = true
      clearTimeout(timer)
      if (heartbeat) clearInterval(heartbeat)
      terminals.release(connection.id)
    }
    // ws calls close() when receiving the peer's close frame. Release ownership
    // before replying, so a client that observes closure can immediately reconnect.
    const close = socket.close.bind(socket)
    socket.close = (code, reason) => {
      cleanup()
      close(code, reason)
    }
    socket.on("close", cleanup)
    socket.on("error", () => {
      cleanup()
      socket.terminate()
    })
    let alive = true
    socket.on("pong", () => {
      alive = true
    })
    heartbeat = setInterval(() => {
      if (!alive) {
        cleanup()
        socket.terminate()
        return
      }
      alive = false
      if (socket.readyState === WebSocket.OPEN) socket.ping()
    }, heartbeatIntervalMs)
    heartbeat.unref()
    // Bound the transport as well as each terminal's acknowledged stream.
    const send = (data: string | ArrayBufferLike | Uint8Array) => {
      const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength
      if (socket.bufferedAmount + bytes > transportBudget) {
        cleanup()
        socket.terminate()
        return
      }
      if (socket.readyState === WebSocket.OPEN) socket.send(data)
    }
    void handler.upgrade(
      { addEventListener: socket.addEventListener.bind(socket), send },
      { context: { connection } },
    )
  })

  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url !== "/api/rpc") return rejectUpgrade(socket, 404, "Not Found")
    if (stopping) return rejectUpgrade(socket, 503, "Service Unavailable")
    const origin = request.headers.origin
    if (origin !== undefined && !options.origins.includes(origin)) {
      return rejectUpgrade(socket, 403, "Forbidden")
    }
    if (wss.clients.size >= maxConnections) return rejectUpgrade(socket, 429, "Too Many Requests")
    wss.handleUpgrade(request, socket, head, (client) => wss.emit("connection", client, request))
  }

  return {
    attach(httpServer: ServerType): void {
      server = httpServer
      server.on("upgrade", upgrade)
    },
    close(): Promise<void> {
      stop ??= (async () => {
        stopping = true
        server?.off("upgrade", upgrade)
        for (const socket of wss.clients) socket.terminate()
        await new Promise<void>((resolve, reject) => {
          wss.close((error) => (error ? reject(error) : resolve()))
        })
        try {
          await terminals.shutdown()
        } finally {
          store.close()
        }
      })()
      return stop
    },
  }
}
