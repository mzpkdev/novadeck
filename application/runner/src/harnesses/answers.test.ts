import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { AgentName } from "@novadeck/protocol"

import type { Report } from "../shell/reports.js"
import { describe, expect, it } from "../test.js"
import type { HarnessEvent } from "./events.js"
import { hookSeconds, type Launchers } from "./harness.js"
import { harnesses } from "./registry.js"

const delivery =
  '<novadeck-messages note="…">\n<message id="m-1">"hi" & bye</message>\n</novadeck-messages>'

// Each answer is one line of JSON the harness reads.
const line = (text: string): unknown => {
  expect(text.endsWith("\n")).toBe(true)
  expect(text.slice(0, -1)).not.toContain("\n")
  return JSON.parse(text)
}

describe("each harness's hook answers", () => {
  it("continue a Claude Code or Codex Stop with a block, and add prompt-time context", () => {
    for (const agent of ["claude", "codex"] as const) {
      const { answers } = harnesses[agent]
      expect(answers.asks).toEqual({ Stop: "stop", UserPromptSubmit: "prompt" })
      expect(line(answers.stop(delivery))).toEqual({ decision: "block", reason: delivery })
      expect(line(answers.prompt(delivery))).toEqual({
        hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: delivery },
      })
      // With nothing to deliver they print nothing, as without NovaDeck.
      expect(answers.silent("Stop")).toBe("")
      expect(answers.silent("UserPromptSubmit")).toBe("")
    }
  })

  it("continue an Antigravity Stop, inject at its model calls, and always print JSON", () => {
    const { answers } = harnesses.agy
    expect(answers.asks).toEqual({ Stop: "stop", PreInvocation: "prompt" })
    expect(line(answers.stop(delivery))).toEqual({ decision: "continue", reason: delivery })
    expect(line(answers.prompt(delivery))).toEqual({
      injectSteps: [{ ephemeralMessage: delivery }],
    })
    expect(line(answers.silent("Stop"))).toEqual({})
    expect(line(answers.silent("PreInvocation"))).toEqual({})
    // An answer without a decision denies the tool.
    expect(line(answers.silent("PreToolUse"))).toEqual({ decision: "ask" })
  })
})

const launchers: Launchers = { mcp: "/data/shell/mcp" }
const file = (agent: AgentName, path: string) =>
  JSON.parse(
    harnesses[agent].files("linux", launchers).find((each) => each.path === path)!.content,
  ) as { hooks?: object; novadeck?: object }

// Every handler a hooks.json registers, however its harness nests them.
const handlers = (value: unknown): { command: string; timeout?: number }[] => {
  if (Array.isArray(value)) return value.flatMap(handlers)
  if (typeof value !== "object" || value === null) return []
  if ("command" in value) return [value as { command: string; timeout?: number }]
  return Object.values(value).flatMap(handlers)
}

describe("each harness's hook registrations", () => {
  it("set a timeout well above the hook's own limit, as a slower hook is dropped silently", () => {
    expect(hookSeconds).toBeGreaterThan(5)
    const registered = [
      ...handlers(file("claude", join("novadeck", "hooks", "hooks.json")).hooks),
      ...handlers(file("codex", join("novadeck", "hooks", "hooks.json")).hooks),
      ...handlers(file("agy", "hooks.json").novadeck),
    ]
    expect(registered.length).toBeGreaterThan(15)
    for (const handler of registered) expect(handler.timeout).toBe(hookSeconds)
  })

  it("register every event that asks", () => {
    expect(Object.keys(file("claude", join("novadeck", "hooks", "hooks.json")).hooks!)).toEqual(
      expect.arrayContaining(Object.keys(harnesses.claude.answers.asks)),
    )
    expect(Object.keys(file("codex", join("novadeck", "hooks", "hooks.json")).hooks!)).toEqual(
      expect.arrayContaining(Object.keys(harnesses.codex.answers.asks)),
    )
    expect(Object.keys(file("agy", "hooks.json").novadeck!)).toEqual(
      expect.arrayContaining(Object.keys(harnesses.agy.answers.asks)),
    )
  })
})

type Scenario = { events: { event: string; payload: Report["payload"] }[] }
const scenario = (agent: AgentName, name: string): Scenario =>
  (
    JSON.parse(
      readFileSync(join(import.meta.dirname, agent, "fixtures", "interactive.probe.json"), "utf8"),
    ) as { scenarios: { [name: string]: Scenario } }
  ).scenarios[name]!

const decode = (agent: AgentName, event: string, payload: Report["payload"]) =>
  harnesses[agent].decode({
    terminalId: "t",
    token: "0".repeat(48),
    agent,
    event,
    seq: 1,
    instance: "7",
    env: { cursor: false },
    payload,
  })

// The turn facts among what a harness decoded.
const turns = (events: readonly HarnessEvent[]) =>
  events.filter(({ type }) => type.startsWith("turn-"))

describe("root turns, as each harness reports them", () => {
  it("start an Antigravity turn at its first model call; later calls are of the same turn", () => {
    const { events } = scenario("agy", "confirm")
    const calls = events
      .filter(({ event }) => event === "PreInvocation")
      .map(({ event, payload }) => turns(decode("agy", event, payload))[0])
    expect(calls.map((call) => call?.type === "turn-started" && call.cause)).toEqual([
      "prompt",
      "call",
      "prompt",
      "prompt",
      "call",
    ])
    // Without a number, it may be any call: never taken for the first.
    expect(turns(decode("agy", "PreInvocation", { conversationId: "c" }))).toMatchObject([
      { cause: "call" },
    ])
  })

  it("end an Antigravity turn at its Stop, saying whether background work still runs", () => {
    const stops = scenario("agy", "confirm")
      .events.filter(({ event }) => event === "Stop")
      .map(({ event, payload }) => turns(decode("agy", event, payload)))
    expect(stops).toMatchObject([
      [{ type: "turn-ended", outcome: "completed", background: false }],
      [{ type: "turn-ended", outcome: "completed", background: true }],
    ])
    expect(
      turns(decode("agy", "Stop", { conversationId: "c", error: "quota", fullyIdle: true })),
    ).toMatchObject([{ outcome: "failed" }])
  })

  it("never take Antigravity's idle status line for a completed turn", () => {
    const idle = decode("agy", "StatusLine", { conversation_id: "c", agent_state: "idle" })
    expect(turns(idle)).toEqual([
      { type: "turn-idle", agent: "agy", sessionId: "c", instance: "7", startedAt: 1 },
    ])
    expect(idle[0]).toMatchObject({ type: "session-observed", root: true })
    // Its hooks name subagents' conversations alike, so none of theirs is the root's word.
    expect(decode("agy", "PreInvocation", { conversationId: "c" })[0]).not.toHaveProperty("root")
  })

  it("tell a Claude Code turn it started by itself, and background tasks still running", () => {
    const prompt = (text: string) =>
      turns(decode("claude", "UserPromptSubmit", { session_id: "s", prompt: text }))
    expect(prompt("Review a.ts")).toMatchObject([{ type: "turn-started", cause: "prompt" }])
    expect(prompt("<task-notification>\n<task-id>b1</task-id>")).toMatchObject([
      { cause: "harness" },
    ])
    const stop = (tasks: unknown) =>
      turns(decode("claude", "Stop", { session_id: "s", background_tasks: tasks }))
    expect(stop([{ id: "b1", status: "running" }])).toMatchObject([{ background: true }])
    expect(stop([])).toMatchObject([{ background: false }])
    expect(stop(undefined)).toMatchObject([{ background: false }])
  })

  it("leave a subagent's prompt out of the root's turns", () => {
    for (const agent of ["claude", "codex"] as const)
      expect(
        turns(decode(agent, "UserPromptSubmit", { session_id: "s", agent_id: "a", prompt: "x" })),
      ).toEqual([])
    expect(turns(decode("codex", "UserPromptSubmit", { session_id: "s" }))).toMatchObject([
      { cause: "prompt" },
    ])
  })
})
