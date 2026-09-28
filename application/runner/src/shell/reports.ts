import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { agentName, agentSessionId, type AgentName } from "@novadeck/protocol"

/** What the agent hook reports: which session runs in which terminal. */
export type Report = {
  readonly terminalId: string
  readonly token: string
  readonly agent: AgentName
  readonly sessionId: string
  readonly seq: number
}

// The hook also sends `source`, why the agent started the session (startup, resume,
// clear…), which is informational.
const parse = (value: unknown): Report | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const { terminalId, token, agent, sessionId, seq } = value as Record<string, unknown>
  if (typeof terminalId !== "string" || terminalId.length > 64) return undefined
  if (typeof token !== "string" || token.length > 128) return undefined
  if (typeof seq !== "number" || !Number.isFinite(seq)) return undefined
  const name = agentName.safeParse(agent)
  const session = agentSessionId.safeParse(sessionId)
  if (!name.success || !session.success) return undefined
  return { terminalId, token, agent: name.data, sessionId: session.data, seq }
}

const maxBytes = 4096
const timeoutMs = 2_000

export type Reports = {
  /** Where the hook connects: a socket in a private directory, or a named pipe. */
  readonly endpoint: string
  close(): Promise<void>
}

/**
 * Listens for agent hook reports. This endpoint takes one kind of message and nothing
 * else: a report of an agent session, which `accept` checks against the terminal's own
 * token. Each connection sends one JSON line and is closed.
 */
export const listenForReports = async (
  accept: (report: Report) => void,
  platform = process.platform,
): Promise<Reports> => {
  const directory =
    platform === "win32" ? undefined : await mkdtemp(join(tmpdir(), "novadeck-reports-"))
  const endpoint =
    directory === undefined
      ? `\\\\.\\pipe\\novadeck-reports-${randomUUID()}`
      : join(directory, "reports.sock")
  const server: Server = createServer((socket: Socket) => {
    let text = ""
    socket.setEncoding("utf8")
    socket.setTimeout(timeoutMs, () => socket.destroy())
    socket.on("error", () => socket.destroy())
    socket.on("data", (chunk: string) => {
      text += chunk
      if (text.length > maxBytes) socket.destroy()
      const end = text.indexOf("\n")
      if (end < 0) return
      socket.end()
      let value: unknown
      try {
        value = JSON.parse(text.slice(0, end))
      } catch {
        return
      }
      const parsed = parse(value)
      if (parsed) accept(parsed)
    })
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(endpoint, () => {
        server.off("error", reject)
        resolve()
      })
    })
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true })
    throw error
  }
  server.unref()
  return {
    endpoint,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      if (directory) await rm(directory, { recursive: true, force: true })
    },
  }
}
