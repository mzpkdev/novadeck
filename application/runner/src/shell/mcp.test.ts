import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll } from "vitest"

import { describe, expect, it } from "../test.js"
import { mcpScript } from "./mcp.js"
import { listenForReports, type Call, type Reports } from "./reports.js"

const token = "0123456789abcdef".repeat(3)
let folder: string
let script: string

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "novadeck-mcp-test-"))
  script = join(folder, "mcp.mjs")
  await writeFile(script, mcpScript)
})

afterAll(async () => {
  await rm(folder, { recursive: true, force: true })
})

// One message the server sent back.
type Answer = {
  readonly id?: number
  readonly result?: {
    readonly tools?: readonly { readonly name: string }[]
    readonly [key: string]: unknown
  }
  readonly error?: { readonly code: number }
}

// Runs the server as an agent would, sends it these messages, and collects its answers
// until it has answered every one with an id.
const session = (env: NodeJS.ProcessEnv, messages: readonly object[]) =>
  new Promise<Answer[]>((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env, stdio: ["pipe", "pipe", "inherit"] })
    const expected = messages.filter((message) => "id" in message).length
    const answers: Answer[] = []
    let buffer = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk
      let end
      while ((end = buffer.indexOf("\n")) >= 0) {
        answers.push(JSON.parse(buffer.slice(0, end)) as Answer)
        buffer = buffer.slice(end + 1)
      }
      if (answers.length >= expected) {
        child.stdin.end()
        resolve(answers)
      }
    })
    child.on("error", reject)
    for (const message of messages)
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
  })

const initialize = { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }
const initialized = { method: "notifications/initialized" }
const list = { id: 2, method: "tools/list" }

describe("NovaDeck's MCP server", () => {
  describe("outside a NovaDeck terminal", () => {
    it("answers the handshake and offers no tools", async () => {
      const answers = await session({ PATH: process.env.PATH }, [initialize, initialized, list])
      expect(answers[0]).toMatchObject({
        id: 1,
        result: { protocolVersion: "2025-06-18", serverInfo: { name: "novadeck" } },
      })
      expect(answers[1]).toEqual({ jsonrpc: "2.0", id: 2, result: { tools: [] } })
    })
  })

  describe("in a NovaDeck terminal", () => {
    let reports: Reports
    const calls: Call[] = []
    let answer: unknown = { ok: true, id: "abc", kind: "image", name: "hero.png" }

    beforeAll(async () => {
      reports = await listenForReports(
        () => {},
        async (call) => {
          calls.push(call)
          return answer
        },
      )
    })

    afterAll(async () => {
      await reports.close()
    })

    const terminal = () => ({
      PATH: process.env.PATH,
      NOVADECK_TERMINAL_ID: "3f1c2b1e-0000-4000-8000-000000000001",
      NOVADECK_REPORT: reports.endpoint,
      NOVADECK_REPORT_TOKEN: token,
    })

    it("offers the show tool", async () => {
      const [, tools] = await session(terminal(), [initialize, list])
      expect(tools?.result?.tools?.map((tool) => tool.name)).toEqual(["show"])
    })

    it("forwards a call to the terminal's runner with its token, and says what happened", async () => {
      calls.length = 0
      answer = { ok: true, id: "abc", kind: "image", name: "hero.png" }
      const [, shown] = await session(terminal(), [
        initialize,
        {
          id: 3,
          method: "tools/call",
          params: { name: "show", arguments: { path: "hero.png", open: true, extra: "dropped" } },
        },
      ])
      expect(calls).toEqual([
        {
          type: "present",
          terminalId: "3f1c2b1e-0000-4000-8000-000000000001",
          token,
          request: { path: "hero.png", open: true },
        },
      ])
      expect(shown?.result).toEqual({
        content: [{ type: "text", text: "Showing hero.png to the user in NovaDeck." }],
        isError: false,
      })
    })

    it("passes on why something can't be shown", async () => {
      answer = { ok: false, reason: "That file is outside this project." }
      const [, refused] = await session(terminal(), [
        initialize,
        {
          id: 4,
          method: "tools/call",
          params: { name: "show", arguments: { path: "/etc/passwd" } },
        },
      ])
      expect(refused?.result).toEqual({
        content: [{ type: "text", text: "That file is outside this project." }],
        isError: true,
      })
    })

    it("says so when NovaDeck can't be reached", async () => {
      const [, unreachable] = await session(
        { ...terminal(), NOVADECK_REPORT: join(folder, "gone.sock") },
        [
          initialize,
          { id: 5, method: "tools/call", params: { name: "show", arguments: { path: "a" } } },
        ],
      )
      expect(unreachable?.result).toMatchObject({ isError: true })
    })
  })

  it("answers methods it doesn't know with an error", async () => {
    const [, unknown] = await session({ PATH: process.env.PATH }, [
      initialize,
      { id: 6, method: "resources/list" },
    ])
    expect(unknown?.error).toMatchObject({ code: -32601 })
  })
})
