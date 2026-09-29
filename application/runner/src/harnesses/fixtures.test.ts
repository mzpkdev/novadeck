import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "../test.js"

// Sanitized payloads captured from real harness runs; docs/harness-coverage.md rests on
// what they show, so these checks keep the two in step.
type Payload = { readonly [key: string]: unknown }
const fixture = <T>(harness: string, name: string): T =>
  JSON.parse(readFileSync(join(import.meta.dirname, harness, "fixtures", name), "utf8")) as T

const claude = fixture<{
  hookEnvironment: string[]
  events: { event: string; payload: Payload }[]
}>("claude", "hooks.probe.json")
const events = (name: string) => claude.events.filter(({ event }) => event === name)

describe("Claude Code's hooks, as captured", () => {
  it("name the session and its transcript in every payload", () => {
    for (const { payload } of claude.events) {
      expect(payload.session_id).toEqual(expect.any(String))
      expect(payload.transcript_path).toEqual(expect.any(String))
    }
    expect(events("SessionStart")[0]?.payload.source).toBe("startup")
  })

  it("name the Claude Code process in the hook's environment", () => {
    expect(claude.hookEnvironment).toContain("CLAUDE_PID")
  })

  it("ask for permission without a request id, right after the tool call that has one", () => {
    const index = claude.events.findIndex(({ event }) => event === "PermissionRequest")
    const request = claude.events[index]!.payload
    expect(request).not.toHaveProperty("tool_use_id")
    const before = claude.events[index - 1]!
    expect(before.event).toBe("PreToolUse")
    expect(before.payload.tool_use_id).toEqual(expect.any(String))
    // A denial fires nothing for that call.
    const answered = claude.events.filter(
      ({ event, payload }) =>
        event.startsWith("PostToolUse") && payload.tool_use_id === before.payload.tool_use_id,
    )
    expect(answered).toEqual([])
  })

  it("attribute a subagent's tool calls to it, under the root's session", () => {
    const [start] = events("SubagentStart")
    const agent = start!.payload.agent_id
    const inside = claude.events.filter(
      ({ event, payload }) => event === "PreToolUse" && payload.agent_id === agent,
    )
    expect(inside).not.toEqual([])
    expect(inside[0]!.payload.session_id).toBe(start!.payload.session_id)
    expect(events("SubagentStop")[0]?.payload.agent_transcript_path).toEqual(expect.any(String))
  })
})

const exec = fixture<{ events: Payload[] }>("codex", "exec.probe.json")
const rollout = fixture<{ records: { type: string; payload: Payload }[] }>(
  "codex",
  "rollout.probe.json",
)

describe("Codex's rollout, as captured", () => {
  it("names the same thread as its file and its exec events", () => {
    const thread = exec.events.find(({ type }) => type === "thread.started")?.thread_id
    const meta = rollout.records.find(({ type }) => type === "session_meta")?.payload
    expect(meta?.id).toBe(thread)
    expect(meta?.session_id).toBe(thread)
  })

  it("reports rate limit windows as a percentage with an absolute reset in seconds", () => {
    const count = rollout.records.find(
      ({ type, payload }) => type === "event_msg" && payload.type === "token_count",
    )?.payload as { rate_limits: { primary: Payload }; info: Payload }
    const { used_percent, window_minutes, resets_at } = count.rate_limits.primary
    expect(used_percent).toBeGreaterThanOrEqual(0)
    expect(used_percent).toBeLessThanOrEqual(100)
    expect(window_minutes).toEqual(expect.any(Number))
    // Epoch seconds: ten digits until 2286.
    expect(String(resets_at)).toMatch(/^\d{10}$/)
    expect(count.info.model_context_window).toEqual(expect.any(Number))
  })
})

type HookProbe = {
  hookAncestry: string[]
  hookEnvironment: string[]
  events: { event: string; payload: Payload }[]
}
const codexHooks = fixture<HookProbe>("codex", "hooks.probe.json")

describe("Codex's hooks, as captured", () => {
  it("run as children of the Codex process, which identifies its instance", () => {
    expect(codexHooks.hookAncestry).toEqual(["codex"])
  })

  it("attribute a subagent's tool calls to it, under the root's session", () => {
    const root = codexHooks.events[0]!.payload.session_id
    for (const { payload } of codexHooks.events) expect(payload.session_id).toBe(root)
    const agent = codexHooks.events.find(({ event }) => event === "SubagentStart")?.payload.agent_id
    const inside = codexHooks.events.filter(
      ({ event, payload }) => event === "PreToolUse" && payload.agent_id === agent,
    )
    expect(inside).not.toEqual([])
    expect(inside[0]!.payload.turn_id).not.toBe(codexHooks.events[1]!.payload.turn_id)
  })

  it("mark turns with a turn id, and end the session with a reason", () => {
    const prompt = codexHooks.events.find(({ event }) => event === "UserPromptSubmit")
    expect(prompt?.payload.turn_id).toEqual(expect.any(String))
    expect(codexHooks.events.at(-1)).toMatchObject({
      event: "SessionEnd",
      payload: { reason: "other" },
    })
  })
})

const agyHooks = fixture<HookProbe>("agy", "hooks.probe.json")

describe("Antigravity's hooks, as captured", () => {
  it("run through sh, whose parent is the Antigravity process", () => {
    expect(agyHooks.hookAncestry).toEqual(["sh", "agy"])
  })

  it("name the conversation in the payload and the environment", () => {
    for (const { payload } of agyHooks.events)
      expect(payload.conversationId).toEqual(expect.any(String))
    expect(agyHooks.hookEnvironment).toContain("ANTIGRAVITY_CONVERSATION_ID")
  })

  it("fire no PostToolUse for a tool that failed or was denied", () => {
    expect(agyHooks.events.some(({ event }) => event === "PreToolUse")).toBe(true)
    expect(agyHooks.events.some(({ event }) => event === "PostToolUse")).toBe(false)
  })

  it("end with Stop, naming why in its own upper-case terms", () => {
    const stop = agyHooks.events.at(-1)!
    expect(stop.event).toBe("Stop")
    expect(stop.payload).toMatchObject({ terminationReason: "NO_TOOL_CALL", fullyIdle: true })
  })
})
