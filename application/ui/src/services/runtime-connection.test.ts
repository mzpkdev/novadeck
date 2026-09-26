// @vitest-environment node
import { ws } from "msw"
import { describe, expect, it } from "vitest"

// The real runtime supplies the oRPC/authentication boundary; no simulated handshake.
import { startRuntime } from "../../../runtime/src/terminal-server"
import { server as requests } from "../test/server"
import { createRuntimeConnection } from "./runtime-connection"

describe("authenticated runtime connection", () => {
  it("makes the client available only after authentication and advances generations", async () => {
    const server = await startRuntime({
      port: 0,
      apiToken: "novadeck-connection-tests-only-not-production",
      databasePath: ":memory:",
    })
    const connection = createRuntimeConnection()
    const url = `${server.origin.replace(/^http/, "ws")}/api/rpc`
    requests.use(
      ws.link(url).addEventListener("connection", ({ server: upstream }) => {
        upstream.connect()
      }),
    )
    try {
      expect(() => connection.getClient()).toThrow("disconnected")
      await connection.connect({ url, token: "novadeck-connection-tests-only-not-production" })
      expect(connection.store.getState()).toMatchObject({ status: "connected", generation: 1 })
      expect(await connection.getClient().projects.list()).toEqual([])
      const runtimeId = connection.store.getState().runtimeId
      connection.disconnect()
      expect(() => connection.getClient()).toThrow("disconnected")
      await connection.connect({ url, token: "novadeck-connection-tests-only-not-production" })
      expect(connection.store.getState()).toMatchObject({
        status: "connected",
        generation: 2,
        runtimeId,
      })
      expect(JSON.stringify(connection.store.getState())).not.toContain(
        "novadeck-connection-tests-only-not-production",
      )
    } finally {
      connection.dispose()
      await server.close()
    }
  })
  it("re-authenticates a dropped socket and changes identity when the backend restarts", async () => {
    let server = await startRuntime({
      port: 0,
      apiToken: "novadeck-connection-tests-only-not-production",
      databasePath: ":memory:",
    })
    const connection = createRuntimeConnection()
    const url = `${server.origin.replace(/^http/, "ws")}/api/rpc`
    requests.use(
      ws.link(url).addEventListener("connection", ({ server: upstream }) => {
        upstream.connect()
      }),
    )
    try {
      await connection.connect({ url, token: "novadeck-connection-tests-only-not-production" })
      const previous = connection.store.getState().runtimeId
      const resumed = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe()
          reject(new Error("Reconnect did not complete"))
        }, 4000)
        const unsubscribe = connection.store.subscribe((state) => {
          if (state.status === "connected" && state.generation === 2) {
            clearTimeout(timeout)
            unsubscribe()
            resolve()
          }
        })
      })
      const port = Number(new URL(server.origin).port)
      await server.close()
      server = await startRuntime({
        port,
        apiToken: "novadeck-connection-tests-only-not-production",
        databasePath: ":memory:",
      })
      await resumed
      expect(connection.store.getState().runtimeId).not.toBe(previous)
      expect(await connection.getClient().projects.list()).toEqual([])
    } finally {
      connection.dispose()
      await server.close()
    }
  })
  it("rejects bad credentials without leaking or retrying them", async () => {
    const server = await startRuntime({
      port: 0,
      apiToken: "novadeck-connection-tests-only-not-production",
      databasePath: ":memory:",
    })
    const connection = createRuntimeConnection()
    const url = `${server.origin.replace(/^http/, "ws")}/api/rpc`
    requests.use(
      ws.link(url).addEventListener("connection", ({ server: upstream }) => {
        upstream.connect()
      }),
    )
    try {
      await expect(connection.connect({ url, token: "wrong-private-token" })).rejects.toThrow(
        "authentication",
      )
      expect(connection.store.getState().status).toBe("error")
      expect(JSON.stringify(connection.store.getState())).not.toContain("wrong-private-token")
      expect(() => connection.getClient()).toThrow("disconnected")
    } finally {
      connection.dispose()
      await server.close()
    }
  })
  it("rejects credentials embedded in a URL before opening a socket", async () => {
    const connection = createRuntimeConnection()
    await expect(
      connection.connect({ url: "ws://localhost/api/rpc?token=secret", token: "test" }),
    ).rejects.toThrow("without credentials")
    expect(connection.store.getState().status).toBe("disconnected")
    connection.dispose()
  })
})
