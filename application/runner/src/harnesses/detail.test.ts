import { readFileSync } from "node:fs"
import { join } from "node:path"

import { agentDetail as schema } from "@novadeck/protocol"

import type { Report } from "../shell/reports.js"
import { describe, expect, it } from "../test.js"
import { apply, started, type Activity } from "./activity.js"
import type { Binding } from "./bindings.js"
import { agentDetail, rootRef } from "./detail.js"
import type { ActivityEvent } from "./events.js"
import { subjectOf } from "./harness.js"
import { harnesses } from "./registry.js"

type Scenario = { events: { event: string; payload: Report["payload"] }[] }

// A captured Claude Code scenario's activity as its first request waits on the person,
// bound to the session it names.
const replay = (name: string): { binding: Binding; activity: Activity } => {
  const { scenarios } = JSON.parse(
    readFileSync(join(import.meta.dirname, "claude", "fixtures", "interactive.probe.json"), "utf8"),
  ) as { scenarios: { [name: string]: Scenario } }
  let binding: Binding | undefined
  let activity = started(0)
  const events = scenarios[name]!.events
  const asked = events.findIndex(({ event }) => event === "PermissionRequest")
  events.slice(0, asked + 1).forEach(({ event, payload }, seq) => {
    const report: Report = {
      terminalId: "t",
      token: "0".repeat(48),
      agent: "claude",
      event,
      seq,
      instance: null,
      env: { cursor: false },
      payload,
    }
    for (const fact of harnesses.claude.decode(report)) {
      if (fact.type === "session-observed") {
        binding ??= { agent: "claude", sessionId: fact.sessionId, instance: null }
        continue
      }
      if (fact.type === "telemetry-observed" || !binding) continue
      activity = apply(activity, binding, fact) ?? activity
    }
  })
  return { binding: binding!, activity }
}

describe("what a request asks about", () => {
  it("is a question's prompt and its answers", () => {
    const questions = [
      { question: "Which color?", options: [{ label: "Red" }, { label: "Blue" }, {}] },
    ]
    expect(subjectOf({ questions })).toEqual({ subject: "Which color?", choices: ["Red", "Blue"] })
  })

  it("is the plan's file, the command, or what the call touches", () => {
    expect(subjectOf({ plan: "# Plan", planFilePath: "/p/plan.md" }).subject).toBe("/p/plan.md")
    expect(subjectOf({ command: "rm -rf build", description: "Clean" }).subject).toBe(
      "rm -rf build",
    )
    expect(subjectOf({ command: ["git", "status"] }).subject).toBe("git status")
    expect(subjectOf({ file_path: "/src/a.ts", content: "…" }).subject).toBe("/src/a.ts")
    expect(subjectOf({ url: "https://example.com" }).subject).toBe("https://example.com")
  })

  it("is nothing it cannot read, and never longer than the protocol takes", () => {
    expect(subjectOf(undefined)).toEqual({ subject: null, choices: [] })
    expect(subjectOf({ command: 3 })).toEqual({ subject: null, choices: [] })
    expect(subjectOf({ command: "x".repeat(5000) }).subject).toHaveLength(1024)
    const options = Array.from({ length: 20 }, (_, index) => ({ label: `${index}`.repeat(300) }))
    const { choices } = subjectOf({ questions: [{ question: "Pick", options }] })
    expect(choices).toHaveLength(16)
    expect(choices[0]).toHaveLength(256)
  })
})

describe("an agent's detail", () => {
  it("is only its terminal without an agent", () => {
    expect(agentDetail("t", null, null, null)).toEqual({
      terminalId: "t",
      agent: null,
      sessionId: null,
      activity: null,
      telemetry: null,
      actors: [],
      requests: [],
      coverage: null,
    })
  })

  it("lists a question waiting on the person, with what it asks and its answers", () => {
    const { binding, activity } = replay("question")
    const detail = agentDetail("00000000-0000-4000-8000-000000000001", binding, activity, null)
    expect(schema.parse(detail)).toEqual(detail)
    expect(detail.actors).toEqual([
      { ref: rootRef(binding), role: "root", parent: null, type: null },
    ])
    expect(detail.requests).toEqual([
      {
        ref: expect.stringMatching(/^[\w-]{16}$/),
        actor: rootRef(binding),
        kind: "question",
        tool: "AskUserQuestion",
        subject: "Which color?",
        choices: ["Red", "Blue"],
      },
    ])
    expect(detail.coverage).toBe(harnesses.claude.coverage)
  })

  it("names a plan waiting for review by its file", () => {
    const { binding, activity } = replay("plan")
    expect(agentDetail("t", binding, activity, null).requests).toMatchObject([
      { kind: "plan", tool: "ExitPlanMode", subject: "<path>" },
    ])
  })

  it("gives a request asked again a new ref, and keeps it while the request waits", () => {
    const binding: Binding = { agent: "claude", sessionId: "s", instance: null }
    const base = { agent: "claude", sessionId: "s", instance: null } as const
    const ask = (startedAt: number): ActivityEvent => ({
      ...base,
      startedAt,
      type: "attention-requested",
      requestId: "root:Bash:x",
      actor: null,
      toolName: "Bash",
      kind: "permission",
      subject: "npm test",
      choices: [],
    })
    const first = apply(started(0), binding, ask(1))!
    const ref = agentDetail("t", binding, first, null).requests[0]?.ref
    const done = apply(first, binding, {
      ...base,
      startedAt: 2,
      type: "attention-resolved",
      requestId: "root:Bash:x",
      actor: null,
      toolName: "Bash",
      loose: false,
      outcome: "allowed",
    })!
    expect(agentDetail("t", binding, done, null).requests[0]?.ref).toBeUndefined()
    const again = apply(done, binding, ask(3))!
    expect(agentDetail("t", binding, again, null).requests[0]?.ref).not.toBe(ref)
  })

  it("lists a subagent that asks before its start was seen", () => {
    const binding: Binding = { agent: "claude", sessionId: "s", instance: null }
    const activity = apply(started(0), binding, {
      agent: "claude",
      sessionId: "s",
      instance: null,
      startedAt: 1,
      type: "attention-requested",
      requestId: "a1:Bash:x",
      actor: "a1",
      toolName: "Bash",
      kind: "permission",
      subject: null,
      choices: [],
    })!
    const detail = agentDetail("t", binding, activity, null)
    expect(detail.actors.map(({ ref }) => ref)).toContain(detail.requests[0]?.actor)
    expect(detail.actors[1]).toMatchObject({ role: "subagent", type: null })
  })

  it("shows subagents and their requests under their own refs, never their native ids", () => {
    const binding: Binding = { agent: "codex", sessionId: "s", instance: null }
    const base = { agent: "codex", sessionId: "s", instance: null, startedAt: 1 } as const
    const events: ActivityEvent[] = [
      { ...base, type: "subagent-started", actor: "native-agent-7", actorType: "explorer" },
      {
        ...base,
        type: "attention-requested",
        requestId: "native-agent-7:shell:abc",
        actor: "native-agent-7",
        toolName: "shell",
        kind: "permission",
        subject: "ls",
        choices: [],
      },
    ]
    const activity = events.reduce(
      (state, event) => apply(state, binding, event) ?? state,
      started(0),
    )
    const detail = agentDetail("t", binding, activity, null)
    const [root, subagent] = detail.actors
    expect(subagent).toMatchObject({ role: "subagent", parent: null, type: "explorer" })
    expect(detail.requests[0]?.actor).toBe(subagent?.ref)
    expect(detail.activity?.subagents).toEqual([{ id: subagent?.ref, type: "explorer" }])
    expect(root?.ref).not.toBe(subagent?.ref)
    expect(JSON.stringify(detail)).not.toContain("native-agent-7")
  })
})
