import { writeFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "../test.js"
import { folder } from "../testing/engines.js"
import { Server, type Launch, type ServerSpec } from "./server.js"
import { EngineError } from "./unpack.js"

// A program of its own, not whisper's: it listens on --port and tells its environment
// at /env, logging one line to say it is up.
const script = `
import { createServer } from "node:http"
const port = Number(process.argv[process.argv.indexOf("--port") + 1])
if (process.argv.includes("--exit-with-stdin")) { process.stdin.on("end", () => process.exit(0)); process.stdin.resume() }
console.error("ready on the device " + process.env.TEST_DEVICE)
createServer((request, response) => {
  if (request.url === "/prefix/health") return response.end("ok")
  if (request.url === "/prefix/env") return response.end(process.env.TEST_KEY + "/" + process.env.TEST_DEVICE)
  response.statusCode = 404
  response.end()
}).listen(port, "127.0.0.1")
`

type Config = { readonly folder: string; readonly key: string }

const spec: ServerSpec<Config, { device: string | undefined }> = {
  program: "demo-server",
  subject: "Demo",
  health: "/health",
  key: (config) => config.key,
  facts: () => ({ device: undefined }),
  prepare: (config, port) => ({
    path: "/prefix",
    args: ["--port", String(port), "--exit-with-stdin"],
    env: { TEST_KEY: config.key },
  }),
  onLine(line, facts) {
    const heard = /device (\S+)/.exec(line)
    if (heard) facts.device = heard[1]
  },
}

const launchWith = async (
  resources: Parameters<typeof folder>[0],
  env?: Record<string, string>,
) => {
  const directory = await folder(resources)
  const file = join(directory, "demo.mjs")
  await writeFile(file, script)
  const launch: Launch = (_program, args) => ({
    command: process.execPath,
    args: [file, ...args],
    ...(env && { env }),
  })
  return { directory, launch }
}

describe("a server", () => {
  it("runs the program under a path of its own, with the environment its spec and the launch give", async ({
    resources,
  }) => {
    const { directory, launch } = await launchWith(resources, { TEST_DEVICE: "Vulkan0" })
    const server = new Server(spec, { launch })
    resources.defer(() => server.close())

    const running = await server.acquire({ folder: directory, key: "secret" })
    const response = await server.request(running, "/env", { signal: AbortSignal.timeout(5000) })

    expect(await response.text()).toBe("secret/Vulkan0")
    expect(server.facts?.device).toBe("Vulkan0")
    await server.stop()
    expect(server.facts).toBeUndefined()
  })

  it("starts another process for another key and shares one for the same", async ({
    resources,
  }) => {
    const { directory, launch } = await launchWith(resources)
    const server = new Server(spec, { launch })
    resources.defer(() => server.close())

    const first = await server.acquire({ folder: directory, key: "a" })
    const again = await server.acquire({ folder: directory, key: "a" })
    const other = await server.acquire({ folder: directory, key: "b" })

    expect(again).toBe(first)
    expect(other).not.toBe(first)
    expect(first.stopped).toBe(true)
  })

  it("words its failures with its subject", async ({ resources }) => {
    const server = new Server(spec, {
      launch: () => ({
        command: process.execPath,
        args: ["-e", "console.error('boom'); process.exit(2)"],
      }),
    })
    resources.defer(() => server.close())
    const directory = await folder(resources)

    const failure = server.start({ folder: directory, key: "a" })

    await expect(failure).rejects.toThrow(EngineError)
    await expect(failure).rejects.toThrow("Demo failed: the engine stopped")
  })
})
