import { readdir } from "node:fs/promises"
import { createServer } from "node:http"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { createRuntimeClient } from "@novadeck/protocol/client"
import type { RuntimeService } from "@novadeck/runtime"

import { describe, expect, it } from "../test"

describe("compiled desktop terminal service", () => {
  it("authenticates a real WebSocket client using the bundled server and installed transport", async () => {
    const directory = join(process.cwd(), "out", "main", "chunks")
    const files = await readdir(directory)
    const entry = files.find((file) => file.startsWith("server-") && file.endsWith(".js"))
    if (!entry) throw new Error("The desktop terminal service was not built")
    const module = await import(pathToFileURL(join(directory, entry)).href)
    const token = "compiled-desktop-test-token-with-no-real-credentials"
    const service: RuntimeService = module.createApi({ token, origins: [] })
    const server = createServer((_request, response) => response.end("desktop test"))
    service.attach(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("The test server has no TCP port")
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/rpc`)

    try {
      const client = createRuntimeClient(socket)
      const handshake = await client.runtime.handshake(
        { protocolVersion: 1, token },
        { signal: AbortSignal.timeout(2_500) },
      )
      expect(handshake.protocolVersion).toBe(1)
      expect(handshake.capabilities).toContain("terminal-replay")
      expect(await client.projects.list()).toEqual([])
    } finally {
      socket.close()
      await service.close()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})
