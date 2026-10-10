import { describe, expect, it } from "../test.js"
import type { AgentDigest } from "./describer.js"
import { Preparer } from "./prepare.js"

const script = new URL("../testing/slow-worker.mjs", import.meta.url)
const digest = (project: string): AgentDigest => ({
  kind: "agent",
  harness: "Claude Code",
  project,
  folder: null,
  branch: null,
  plan: null,
  folders: [],
  prompts: ["fix it"],
  reply: null,
  summary: null,
  previous: null,
})

describe("preparing a digest in a thread", () => {
  it("answers with the chat", async ({ resources }) => {
    const preparer = new Preparer({ script })
    resources.defer(() => preparer.close())

    expect(await preparer.prepare(digest("app"))).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "about app" },
    ])
  })

  it("redacts with the real thread, from source", { timeout: 20_000 }, async ({ resources }) => {
    const preparer = new Preparer()
    resources.defer(() => preparer.close())

    const chat = await preparer.prepare({
      ...digest("app"),
      prompts: ["use API_KEY=hunter2abc please"],
    })

    expect(chat).toHaveLength(2)
    expect(JSON.stringify(chat)).not.toContain("hunter2abc")
    expect(JSON.stringify(chat)).toContain("[redacted]")
  })

  it(
    "ends a thread that takes too long, leaves the event loop running, and starts another",
    {
      timeout: 10_000,
    },
    async ({ resources }) => {
      const preparer = new Preparer({ script, deadlineMs: 300 })
      resources.defer(() => preparer.close())
      await preparer.prepare(digest("app"))
      let ticks = 0
      const timer = setInterval(() => (ticks += 1), 20)

      const late = await preparer.prepare(digest("hang"))
      clearInterval(timer)

      expect(late).toBe("late")
      // The loop kept going the whole while the thread was stuck.
      expect(ticks).toBeGreaterThan(8)
      expect(preparer.running).toBe(false)
      expect(await preparer.prepare(digest("again"))).toEqual([
        { role: "system", content: "system" },
        { role: "user", content: "about again" },
      ])
    },
  )

  it("is dropped by its signal", async ({ resources }) => {
    const preparer = new Preparer({ script, deadlineMs: 5000 })
    resources.defer(() => preparer.close())
    await preparer.prepare(digest("app"))
    const controller = new AbortController()

    const job = preparer.prepare(digest("hang"), controller.signal)
    setTimeout(() => controller.abort(), 50)

    expect(await job).toBeUndefined()
    await preparer.stop()
  })

  it("ends the thread at close, and starts no other", async () => {
    const preparer = new Preparer({ script })
    await preparer.prepare(digest("app"))
    expect(preparer.running).toBe(true)

    await preparer.close()

    expect(preparer.running).toBe(false)
    expect(await preparer.prepare(digest("app"))).toBeUndefined()
  })

  it("ends an idle thread", async () => {
    const preparer = new Preparer({ script, idleMs: 50 })
    await preparer.prepare(digest("app"))

    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(preparer.running).toBe(false)
    await preparer.close()
  })
})
