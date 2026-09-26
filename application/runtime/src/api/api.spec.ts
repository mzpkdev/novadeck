import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { protocolVersion, type RuntimeClient, type TerminalEvent } from "@novadeck/protocol"
import { createRuntimeClient } from "@novadeck/protocol/client"
import { afterEach } from "vitest"
import { WebSocket as NodeWebSocket } from "ws"

import { startRuntime, type RuntimeOptions } from "../terminal-server.js"
import { context, describe, expect, it } from "../test.js"

const token = "novadeck-api-tests-only-not-a-production-credential"
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    // eslint-disable-next-line no-await-in-loop -- Close clients before runtimes and their database directories.
    await cleanup()
  }
})

const fixture = async (options: RuntimeOptions = {}) => {
  const directory = await mkdtemp(join(tmpdir(), "novadeck-api-"))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const runtime = await startRuntime({
    port: 0,
    apiToken: token,
    databasePath: join(directory, "workspace.sqlite"),
    ...options,
    terminal: {
      shell: process.execPath,
      shellArgs: ["--interactive"],
      env: { NODE_REPL_HISTORY: "", NODE_DISABLE_COLORS: "1" },
      ...options.terminal,
    },
  })
  cleanups.push(() => runtime.close())
  const url = `${runtime.origin.replace(/^http/, "ws")}/api/rpc`

  const connect = async (authenticate = true) => {
    const socket = new WebSocket(url)
    socket.binaryType = "arraybuffer"
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true })
      socket.addEventListener("error", () => reject(new Error("Connection failed")), { once: true })
    })
    const client = createRuntimeClient(socket)
    const disconnect = async () => {
      if (socket.readyState === WebSocket.CLOSED) return
      const closed = new Promise<void>((resolve) =>
        socket.addEventListener("close", () => resolve(), { once: true }),
      )
      socket.close()
      await closed
    }
    cleanups.push(disconnect)
    if (authenticate) await client.runtime.handshake({ protocolVersion, token })
    return { client, socket, disconnect }
  }

  const setup = async (client: RuntimeClient) => {
    const project = await client.projects.create({ name: "API workspace", cwd: directory })
    const session = await client.sessions.create({ projectId: project.id, name: "Session" })
    return { project, session }
  }

  return { runtime, url, directory, connect, setup }
}

const reader = async (
  client: RuntimeClient,
  terminalId: string,
  options: { afterSequence?: number; mode?: "control" | "observe" } = {},
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error("Terminal event timed out")), 8_000)
  timeout.unref()
  cleanups.push(async () => {
    clearTimeout(timeout)
    controller.abort()
  })
  const stream = await client.terminals.attach(
    { terminalId, ...options },
    { signal: controller.signal },
  )
  const events: TerminalEvent[] = []
  let text = ""
  const next = async () => {
    const result = await stream.next()
    if (result.done) throw new Error("Terminal stream ended before the expected event")
    const event = result.value
    events.push(event)
    if (event.type === "snapshot") text = event.data
    if (event.type === "output") text += event.data
    await client.terminals.ack({ terminalId, sequence: event.sequence })
    return event
  }
  const until = async (predicate: (event: TerminalEvent) => boolean) => {
    while (true) {
      // eslint-disable-next-line no-await-in-loop -- Consume ordered terminal events until the assertion checkpoint.
      const event = await next()
      if (predicate(event)) return event
    }
  }
  return {
    next,
    until,
    events,
    text: () => text,
    untilText: (value: string) => until(() => text.includes(value)),
    detach: () => controller.abort(),
    stream,
  }
}

const print = (client: RuntimeClient, terminalId: string, first: string, second: string) =>
  client.terminals.write({
    terminalId,
    data: `console.log(${JSON.stringify(first)} + ${JSON.stringify(second)})\r`,
  })

describe("terminal API over WebSockets", () => {
  context("before authentication and protocol negotiation", () => {
    it("keeps terminal access disabled when no credential is configured", async () => {
      const runtime = await startRuntime({ port: 0 })
      cleanups.push(() => runtime.close())
      const response = await fetch(`${runtime.origin}/api/rpc`)
      expect(response.status).toBe(404)
      await expect(fetch(`${runtime.origin}/api/status`)).resolves.toMatchObject({ ok: true })
    })

    it("rejects unauthenticated operations and wrong credentials", async () => {
      const app = await fixture()
      const { client } = await app.connect(false)
      await expect(client.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      await expect(
        client.runtime.handshake({ protocolVersion, token: "wrong" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      await expect(
        client.sessions.create({ projectId: randomUUID(), name: "denied" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      const info = await client.runtime.handshake({ protocolVersion, token })
      expect(info).toMatchObject({
        protocolVersion,
        capabilities: expect.arrayContaining(["terminal-replay", "terminal-ack"]),
      })
      expect(info.runtimeId).toEqual(expect.any(String))
      await expect(client.projects.list()).resolves.toEqual([])
    })

    it("requires compatible clients and does not authenticate a failed handshake", async () => {
      const app = await fixture()
      const { client } = await app.connect(false)
      await expect(client.runtime.handshake({ protocolVersion: 99, token })).rejects.toMatchObject({
        code: "INCOMPATIBLE_PROTOCOL",
      })
      await expect(client.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    })

    it("checks browser origins before accepting a WebSocket", async () => {
      const app = await fixture({ corsOrigins: ["https://trusted.novadeck.test"] })
      const denied = new NodeWebSocket(app.url, { origin: "https://untrusted.novadeck.test" })
      const failure = await new Promise<Error>((resolve) => denied.once("error", resolve))
      expect(failure.message).toContain("403")
      const accepted = new NodeWebSocket(app.url, { origin: "https://trusted.novadeck.test" })
      await once(accepted, "open")
      const closed = once(accepted, "close")
      accepted.close()
      await closed
    })

    it("bounds the number of connections, including unauthenticated clients", async () => {
      const app = await fixture({ maxConnections: 1 })
      await app.connect(false)
      const denied = new NodeWebSocket(app.url)
      const failure = await new Promise<Error>((resolve) => denied.once("error", resolve))
      expect(failure.message).toContain("429")
    })

    it("disconnects unresponsive peers using heartbeat pings", async () => {
      const app = await fixture({ heartbeatIntervalMs: 50 })
      const silent = new NodeWebSocket(app.url, { autoPong: false })
      const closed = once(silent, "close")
      await once(silent, "open")
      await closed
      expect(silent.readyState).toBe(NodeWebSocket.CLOSED)
      const { client } = await app.connect()
      await expect(client.projects.list()).resolves.toEqual([])
    })
  })

  context("when managing workspace metadata", () => {
    it("creates, lists, renames, and persists projects and sessions across a restart", async () => {
      const app = await fixture()
      const { client, disconnect } = await app.connect()
      const { project, session } = await app.setup(client)
      await client.projects.rename({ projectId: project.id, name: "Renamed project" })
      await client.sessions.rename({ sessionId: session.id, name: "Renamed session" })
      await disconnect()
      await app.runtime.close()
      const restarted = await fixture({ databasePath: join(app.directory, "workspace.sqlite") })
      const connection = await restarted.connect()
      await expect(connection.client.projects.list()).resolves.toEqual([
        { ...project, name: "Renamed project" },
      ])
      await expect(connection.client.sessions.list({ projectId: project.id })).resolves.toEqual([
        { ...session, name: "Renamed session" },
      ])
      await expect(connection.client.terminals.list({ sessionId: session.id })).resolves.toEqual([])
    })

    it("validates payloads, existing directories, and workspace relationships", async () => {
      const app = await fixture()
      const { client } = await app.connect()
      await expect(client.projects.create({ name: " ", cwd: app.directory })).rejects.toMatchObject(
        { code: "BAD_REQUEST" },
      )
      await expect(
        client.projects.create({ name: "Missing", cwd: join(app.directory, "missing") }),
      ).rejects.toMatchObject({ code: "INVALID_DIRECTORY" })
      await expect(
        client.sessions.create({ projectId: randomUUID(), name: "Missing" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const { session } = await app.setup(client)
      await expect(
        client.terminals.create({ sessionId: session.id, cols: 0, rows: 24 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
      await expect(
        client.terminals.create({ sessionId: randomUUID(), cols: 80, rows: 24 }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(
        client.terminals.resize({ terminalId: randomUUID(), cols: 80, rows: 24 }),
      ).rejects.toMatchObject({ code: "TERMINAL_NOT_FOUND" })
    })
  })

  context("when running a real terminal process", () => {
    it("interrupts a busy process with Ctrl-C and continues accepting input", async () => {
      const app = await fixture()
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      const output = await reader(client, terminal.id)
      await output.next()
      await client.terminals.write({
        terminalId: terminal.id,
        data: 'console.log("BUSY_" + "STARTED"); while (true) {}\r',
      })
      await output.untilText("BUSY_STARTED")
      await client.terminals.write({ terminalId: terminal.id, data: "\u0003" })
      await print(client, terminal.id, "INTERRUPT_", "RECOVERED")
      await output.untilText("INTERRUPT_RECOVERED")
    })

    it("stops attached shells and closes connections during runtime shutdown", async () => {
      const app = await fixture()
      const { client, socket } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      const output = await reader(client, terminal.id)
      await output.next()
      await client.terminals.write({
        terminalId: terminal.id,
        data: 'console.log("CHILD_" + "PID=" + process.pid + ";")\r',
      })
      await output.untilText("CHILD_PID=")
      const pid = Number(/CHILD_PID=(\d+);/.exec(output.text())?.[1])
      expect(pid).toBeGreaterThan(0)
      const closed = new Promise<void>((resolve) =>
        socket.addEventListener("close", () => resolve(), { once: true }),
      )
      await app.runtime.close()
      await closed
      await app.runtime.close()
      expect(() => process.kill(pid, 0)).toThrow()
    })

    it("streams output, accepts input, applies PTY dimensions, and reports process exit", async () => {
      const app = await fixture()
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      const output = await reader(client, terminal.id)
      expect(await output.next()).toMatchObject({
        type: "snapshot",
        status: "running",
        cols: 80,
        rows: 24,
      })
      await print(client, terminal.id, "PTY_", "CONNECTED")
      await output.untilText("PTY_CONNECTED")
      await client.terminals.resize({ terminalId: terminal.id, cols: 132, rows: 43 })
      await output.until(
        (event) => event.type === "resized" && event.cols === 132 && event.rows === 43,
      )
      await client.terminals.write({
        terminalId: terminal.id,
        data: 'console.log("SIZE_" + process.stdout.columns + "x" + process.stdout.rows + "_TTY_" + process.stdin.isTTY)\r',
      })
      await output.untilText("SIZE_132x43_TTY_true")
      await expect(client.terminals.list({ sessionId: session.id })).resolves.toEqual([
        expect.objectContaining({ id: terminal.id, status: "running", cols: 132, rows: 43 }),
      ])
      await client.terminals.write({ terminalId: terminal.id, data: "process.exit(7)\r" })
      expect(await output.until((event) => event.type === "exited")).toMatchObject({ exitCode: 7 })
      await expect(client.terminals.list({ sessionId: session.id })).resolves.toEqual([
        expect.objectContaining({ status: "exited", exitCode: 7 }),
      ])
      const sequences = output.events.map((event) => event.sequence)
      expect(sequences).toEqual([...new Set(sequences)].toSorted((a, b) => a - b))
    })

    it("explicitly closes the shell and reuses capacity after closed records are evicted", async () => {
      const app = await fixture({
        terminal: {
          maxTerminals: 1,
          shell: process.execPath,
          shellArgs: ["--interactive"],
          env: { NODE_REPL_HISTORY: "" },
        },
      })
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      const first = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      await expect(
        client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 }),
      ).rejects.toMatchObject({ code: "RESOURCE_LIMIT" })
      await client.terminals.close({ terminalId: first.id })
      const second = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      expect(second.id).not.toBe(first.id)
      await client.terminals.close({ terminalId: second.id })
    })

    it("rejects invalid directories and reports an unavailable shell without leaving a record", async () => {
      const app = await fixture({
        terminal: { shell: join(tmpdir(), `novadeck-missing-${randomUUID()}`) },
      })
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      await expect(
        client.terminals.create({
          sessionId: session.id,
          cwd: "relative/path",
          cols: 80,
          rows: 24,
        }),
      ).rejects.toMatchObject({ code: "INVALID_DIRECTORY" })
      await expect(
        client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 }),
      ).rejects.toMatchObject({ code: "SPAWN_FAILED" })
      await expect(client.terminals.list({ sessionId: session.id })).resolves.toEqual([])
    })
  })

  context("when clients detach or reconnect", () => {
    it("restores a heavily styled screen larger than the ordinary output budget", async () => {
      const app = await fixture()
      const owner = await app.connect()
      const { session } = await app.setup(owner.client)
      const terminal = await owner.client.terminals.create({
        sessionId: session.id,
        cols: 120,
        rows: 24,
      })
      const output = await reader(owner.client, terminal.id)
      await output.next()
      await owner.client.terminals.write({
        terminalId: terminal.id,
        data: 'var line = Array.from({length:120}, (_,x) => "\\x1b[38;2;"+(x%256)+";"+((x*3)%256)+";"+((x*7)%256)+";48;2;"+((x*11)%256)+";"+((x*13)%256)+";"+((x*17)%256)+"mX").join(""); process.stdout.write((line+"\\r\\n").repeat(1024)); console.log("COLORED_"+"READY")\r',
      })
      await output.untilText("COLORED_READY")
      await owner.disconnect()
      const replacement = await app.connect()
      const restored = await reader(replacement.client, terminal.id)
      const snapshot = await restored.next()
      expect(snapshot.type).toBe("snapshot")
      expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeGreaterThan(4 * 1024 * 1024)
      await print(replacement.client, terminal.id, "LARGE_SCREEN_", "RECOVERED")
      await restored.untilText("LARGE_SCREEN_RECOVERED")
    })

    it("cancels an attachment without killing its shell or poisoning subsequent requests", async () => {
      const app = await fixture()
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      const output = await reader(client, terminal.id)
      await output.next()
      await output.stream.return()
      const reattached = await reader(client, terminal.id)
      await reattached.next()
      await print(client, terminal.id, "CANCEL_", "RECOVERED")
      await reattached.untilText("CANCEL_RECOVERED")
    })

    it("bounds a viewer that does not acknowledge output and permits fresh attachment", async () => {
      const app = await fixture({ terminal: { subscriberBytes: 32 * 1024, ackWindowBytes: 1024 } })
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      const observer = await app.connect()
      const slow = await observer.client.terminals.attach({
        terminalId: terminal.id,
        mode: "observe",
      })
      await slow.next() // Deliberately withhold consumption ACKs.
      const failed = (async () => {
        // eslint-disable-next-line no-await-in-loop -- Exercise stream delivery without acknowledging consumption.
        while (!(await slow.next()).done) {
          /* Drain wire events without ACKs. */
        }
      })()
      const failure = expect(failed).rejects.toMatchObject({ code: "SLOW_CONSUMER" })
      await client.terminals.write({
        terminalId: terminal.id,
        data: 'console.log(("x".repeat(79) + "\\r").repeat(1250)); console.log("OVERFLOW_" + "RECOVERED")\r',
      })
      await failure
      const restored = await reader(observer.client, terminal.id, { mode: "observe" })
      await restored.untilText("OVERFLOW_RECOVERED")
      await expect(client.terminals.list({ sessionId: session.id })).resolves.toEqual([
        expect.objectContaining({ status: "running" }),
      ])
    })

    it("rejects requests and cancels streams cleanly after a socket closes", async () => {
      const app = await fixture()
      const { client, disconnect } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      const output = await reader(client, terminal.id)
      await output.next()
      await disconnect()
      output.detach()
      await expect(client.projects.list()).rejects.toThrow("Runtime connection is closed")
    })

    it("keeps the same process alive and replays only events after the saved cursor", async () => {
      const app = await fixture()
      const owner = await app.connect()
      const { session } = await app.setup(owner.client)
      const terminal = await owner.client.terminals.create({
        sessionId: session.id,
        cols: 80,
        rows: 24,
      })
      const observer = await app.connect()
      const watched = await reader(observer.client, terminal.id, { mode: "observe" })
      await watched.next()
      await print(owner.client, terminal.id, "BEFORE_", "DISCONNECT")
      const checkpoint = await watched.untilText("BEFORE_DISCONNECT")
      await observer.disconnect()
      await print(owner.client, terminal.id, "AFTER_", "DISCONNECT")
      const reconnected = await app.connect()
      const resumed = await reader(reconnected.client, terminal.id, {
        mode: "observe",
        afterSequence: checkpoint.sequence,
      })
      await resumed.untilText("AFTER_DISCONNECT")
      expect(
        resumed.events.every(
          (event) => event.type !== "snapshot" && event.sequence > checkpoint.sequence,
        ),
      ).toBe(true)
      await expect(owner.client.terminals.list({ sessionId: session.id })).resolves.toEqual([
        expect.objectContaining({ id: terminal.id, status: "running" }),
      ])
    })

    it("restores a screen snapshot when the replay window has expired", async () => {
      const app = await fixture({
        terminal: {
          shell: process.execPath,
          shellArgs: ["--interactive"],
          env: { NODE_REPL_HISTORY: "" },
          historyBytes: 128,
        },
      })
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 100, rows: 30 })
      const output = await reader(client, terminal.id)
      await output.next()
      await client.terminals.write({
        terminalId: terminal.id,
        data: 'console.log("x".repeat(5000)); console.log("SNAPSHOT_" + "READY")\r',
      })
      await output.untilText("SNAPSHOT_READY")
      const observer = await app.connect()
      const restored = await reader(observer.client, terminal.id, {
        mode: "observe",
        afterSequence: 0,
      })
      const snapshot = await restored.next()
      expect(snapshot).toMatchObject({ type: "snapshot", status: "running" })
      if (snapshot.type !== "snapshot") throw new Error("Expected restored screen")
      expect(snapshot.data).toContain("SNAPSHOT_READY")
      expect(snapshot.sequence).toBeGreaterThan(0)
    })

    it("enforces one controlling connection and releases control on disconnect", async () => {
      const app = await fixture()
      const owner = await app.connect()
      const observer = await app.connect()
      const { session } = await app.setup(owner.client)
      const terminal = await owner.client.terminals.create({
        sessionId: session.id,
        cols: 80,
        rows: 24,
      })
      await expect(
        observer.client.terminals.write({ terminalId: terminal.id, data: "bad" }),
      ).rejects.toMatchObject({ code: "CONTROL_REQUIRED" })
      await expect(
        observer.client.terminals.resize({ terminalId: terminal.id, cols: 100, rows: 30 }),
      ).rejects.toMatchObject({ code: "CONTROL_REQUIRED" })
      await expect(
        observer.client.terminals.close({ terminalId: terminal.id }),
      ).rejects.toMatchObject({ code: "CONTROL_REQUIRED" })
      const blocked = await reader(observer.client, terminal.id)
      await expect(blocked.next()).rejects.toMatchObject({ code: "CONTROL_IN_USE" })
      await owner.disconnect()
      const acquired = await reader(observer.client, terminal.id)
      await acquired.next()
      await print(observer.client, terminal.id, "CONTROL_", "TRANSFERRED")
      await acquired.untilText("CONTROL_TRANSFERRED")
    })

    it("rejects invalid acknowledgements and leaves the shell usable", async () => {
      const app = await fixture()
      const { client } = await app.connect()
      const { session } = await app.setup(client)
      const terminal = await client.terminals.create({ sessionId: session.id, cols: 80, rows: 24 })
      const output = await reader(client, terminal.id)
      await output.next()
      await expect(
        client.terminals.ack({ terminalId: terminal.id, sequence: Number.MAX_SAFE_INTEGER }),
      ).rejects.toMatchObject({ code: "INVALID_CURSOR" })
      await print(client, terminal.id, "ACK_", "VALIDATION")
      await output.untilText("ACK_VALIDATION")
    })
  })
})
