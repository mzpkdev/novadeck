import { connect } from "node:net"

import { describe, expect, it as base } from "../../test.js"
import type { Dialect } from "./dialect.js"
import { startFakeModel, type FakeModel } from "./server.js"

// A dialect that takes every request to /chat as a call of its body's text, and answers
// with the reply's text, and the headers it was given.
const echo: Dialect = {
  api: "anthropic",
  matches: (request) => request.path.startsWith("/chat"),
  handle: (request, reply) => {
    const answer = reply({
      api: "anthropic",
      model: "m",
      system: "",
      turns: [{ role: "user", text: request.body }],
      tools: [],
      side: false,
    })
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: [JSON.stringify({ text: answer.text, headers: request.headers })],
    }
  },
}

const it = base.extend<{ model: FakeModel }>({
  model: async ({ resources }, use) => {
    const model = await startFakeModel({ dialects: [echo], rules: [() => ({ text: "first" })] })
    resources.defer(() => model.close())
    await use(model)
  },
})

const chat = async (model: FakeModel, text: string, headers: Record<string, string> = {}) => {
  const response = await fetch(`${model.url}/chat`, { method: "POST", body: text, headers })
  return { status: response.status, body: await response.text() }
}

// Sends one raw request, as a proxy client would, and returns the status line.
const raw = (model: FakeModel, request: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = connect(Number(new URL(model.url).port), "127.0.0.1")
    let answer = ""
    socket.on("error", reject)
    socket.on("data", (chunk) => (answer += chunk.toString()))
    socket.on("close", () => resolve(answer.split("\r\n")[0] ?? ""))
    socket.write(request)
  })

describe("startFakeModel", () => {
  it("answers a call through its dialect and records it", async ({ model }) => {
    const { status, body } = await chat(model, "hello")

    expect(status).toBe(200)
    expect(JSON.parse(body)).toMatchObject({ text: "first" })
    expect(model.calls.map((call) => call.turns)).toEqual([[{ role: "user", text: "hello" }]])
  })

  it("asks rules added later first", async ({ model }) => {
    model.use((call) => (call.turns[0]?.text === "special" ? { text: "second" } : undefined))

    expect(JSON.parse((await chat(model, "special")).body).text).toBe("second")
    expect(JSON.parse((await chat(model, "plain")).body).text).toBe("first")
  })

  it("waits for a call made before or after it is asked for", async ({ model }) => {
    await chat(model, "early")
    const late = model.waitFor((call) => call.turns[0]?.text === "late")

    expect((await model.waitFor((call) => call.turns[0]?.text === "early")).turns).toHaveLength(1)
    await chat(model, "late")
    expect((await late).turns[0]).toEqual({ role: "user", text: "late" })
    await expect(model.waitFor(() => false, 50)).rejects.toThrow(/No matching model call/)
  })

  it("accepts its own credential, alone or as a bearer token, and passes on no credential", async ({
    model,
  }) => {
    const keyed = await chat(model, "a", { "x-api-key": model.credential })
    const bearer = await chat(model, "b", { authorization: `Bearer ${model.credential}` })

    expect([keyed.status, bearer.status]).toEqual([200, 200])
    expect(JSON.parse(keyed.body).headers).not.toHaveProperty("x-api-key")
    expect(JSON.parse(bearer.body).headers).not.toHaveProperty("authorization")
    expect(model.foreign).toBe(0)
  })

  it("refuses and counts any other credential, never keeping it", async ({ model }) => {
    const refused = [
      await chat(model, "a", { "x-api-key": "sk-real-one" }),
      await chat(model, "b", { authorization: "Bearer real-token" }),
      await chat(model, "c", { "x-goog-api-key": "real" }),
    ]

    expect(refused.map((one) => one.status)).toEqual([401, 401, 401])
    expect(model.foreign).toBe(3)
    expect(model.calls).toEqual([])
    expect(JSON.stringify([model.strays, refused])).not.toMatch(/real/)
  })

  it("refuses a tunnel through it, recording only its host", async ({ model }) => {
    const status = await raw(
      model,
      "CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n",
    )

    expect(status).toBe("HTTP/1.1 403 Forbidden")
    expect(model.strays).toEqual(["CONNECT api.anthropic.com"])
  })

  it("refuses a request for another server, recording only its host", async ({ model }) => {
    const status = await raw(
      model,
      "GET http://example.com/secret?key=1 HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n",
    )

    expect(status).toBe("HTTP/1.1 403 Forbidden")
    expect(model.strays).toEqual(["GET example.com"])
  })

  it("records a request no dialect answers by its path, without its query", async ({ model }) => {
    const response = await fetch(`${model.url}/v1/unknown?key=1`)

    expect(response.status).toBe(404)
    expect(model.strays).toEqual(["GET /v1/unknown"])
  })
})
