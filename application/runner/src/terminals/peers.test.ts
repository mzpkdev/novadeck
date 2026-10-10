import type { TerminalSummary } from "@novadeck/protocol"

import { started, type Request } from "../harnesses/activity.js"
import type { Messaging } from "../messaging/messaging.js"
import { describe, expect, it } from "../test.js"
import { TerminalPeers, waitingOf, type PeerTerminal } from "./peers.js"
import { freshWork, type Work } from "./work.js"

const request = (fields: Partial<Request>): Request => ({
  requestId: "r-1",
  actor: null,
  toolName: "Bash",
  kind: "permission",
  subject: null,
  choices: [],
  askedAt: 0,
  ...fields,
})

const subject = (fields: Partial<Request>) => waitingOf({ pending: [request(fields)] })?.subject

describe("what peers learn of a request waiting on the person", () => {
  it("is the oldest, with how many wait after it", () => {
    expect(waitingOf({ pending: [] })).toBeNull()
    expect(waitingOf(null)).toBeNull()
    expect(
      waitingOf({
        pending: [request({ subject: "src/a.ts", toolName: "Edit" }), request({}), request({})],
      }),
    ).toEqual({ kind: "permission", tool: "Edit", subject: null, more: 2 })
  })

  it("never shows a permission's subject, whatever it looks like", () => {
    for (const text of [
      "curl -H 'Authorization: Bearer abc' x",
      "https://example.com/?token=abc",
      "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
      "token.txt",
      "/etc/shadow",
      "src/a.ts",
    ])
      expect(subject({ subject: text, toolName: "Write" })).toBeNull()
  })

  it("shows a question's or a plan's subject as it is", () => {
    expect(subject({ kind: "question", subject: "Which database?" })).toBe("Which database?")
    expect(subject({ kind: "plan", subject: "plan.md" })).toBe("plan.md")
  })
})

describe("what a terminal's dictation hint is made of", () => {
  const summary = { cwd: "/nowhere/at/all/api" } as TerminalSummary
  const peers = new TerminalPeers({
    messaging: {} as Messaging,
    caller: () => undefined,
    terminal: () => undefined,
    running: () => [],
    projectFolder: () => undefined,
    stopping: () => false,
  })
  const terminal = (fields: Partial<PeerTerminal>): PeerTerminal => ({
    summary,
    naming: { person: null, agent: null, summary: null },
    work: null,
    activity: null,
    openedBy: null,
    ...fields,
  })

  it("is the files shown, then its work's, its plan, prompts and the agent's last reply", async () => {
    const activity = {
      ...started(1),
      plans: [{ actor: null, source: { kind: "text", text: "# Paging", truncated: false }, at: 1 }],
      lastTurn: { outcome: "completed", reply: "Added pageSize", at: 2, recorded: false },
    } as const
    const work = {
      ...freshWork("claude:s1"),
      first: "Build the orders API",
      latest: "Now add paging",
      folders: { "/w/api/orders": 3, "/w/api": 1 },
      files: ["orders.ts"],
    }
    expect(await peers.hint(terminal({ work, activity }), ["schema.sql"])).toEqual({
      cwd: "/nowhere/at/all/api",
      branch: null,
      folders: ["/w/api/orders", "/w/api"],
      files: ["schema.sql", "orders.ts"],
      plan: "Paging",
      prompts: ["Now add paging", "Build the orders API"],
      reply: "Added pageSize",
    })
  })

  it("leaves out the command of the agent that opened it, and has little without work", async () => {
    const work: Work = {
      ...freshWork("claude:s1"),
      first: "Review it",
      latest: "Review it",
      opened: true,
    }
    const opened = await peers.hint(terminal({ work, openedBy: "t2" }), [])
    expect(opened.prompts).toEqual([])
    const prompted = await peers.hint(
      terminal({ work: { ...work, latest: "Also lint" }, openedBy: "t2" }),
      [],
    )
    expect(prompted.prompts).toEqual(["Also lint"])
    const empty = await peers.hint(terminal({}), [])
    expect(empty).toMatchObject({ folders: [], files: [], plan: null, prompts: [], reply: null })
  })
})
