import { context, describe, expect, it } from "../test"
import { terminalFixture } from "../test/fixtures"
import { agentFinish, agentResumed, finishNotice } from "./agent-finish"
import type { AgentStatus, TerminalMetadata } from "./types"

const base = { ...terminalFixture(1, "~/project"), process: "claude" }
const agent = (status: AgentStatus): TerminalMetadata => ({
  ...base,
  state: "running",
  agent: status,
})
const working = agent({ working: true })
const completed = { outcome: "completed" as const, reply: "All green." }

describe("an agent finishing", () => {
  it("finishes once its turn completes with nothing waking it, with the start of its reply", () => {
    expect(agentFinish(working, agent({ working: false, lastTurn: completed }))).toEqual({
      reply: "All green.",
    })
  })

  it("finishes on a failed turn too, with no reply where none was told", () => {
    const failed = agent({ working: false, lastTurn: { outcome: "failed" } })
    expect(agentFinish(working, failed)).toEqual({})
  })

  it("finishes beside a background command left running, which may run for ever", () => {
    const left = agent({ working: false, background: { agents: 0, tasks: 1 }, lastTurn: completed })
    expect(agentFinish(working, left)).toEqual({ reply: "All green." })
  })

  it("finishes once the subagents it waited on are done, not when its turn ended", () => {
    const waiting = agent({
      working: true,
      background: { agents: 2, tasks: 0 },
      lastTurn: { outcome: "completed", reply: "Waiting on two agents." },
    })
    expect(agentFinish(working, waiting)).toBeUndefined()
    expect(agentFinish(waiting, agent({ working: false, lastTurn: completed }))).toEqual({
      reply: "All green.",
    })
  })

  context("when the person was there", () => {
    it("never finishes on their interrupt, nor an idle that says no more", () => {
      for (const outcome of ["interrupted", "unknown"] as const)
        expect(agentFinish(working, agent({ working: false, lastTurn: { outcome } }))).toBe(
          undefined,
        )
    })

    it("never finishes while it waits on them", () => {
      const asking = agent({
        working: false,
        attention: { kind: "question", count: 1 },
        lastTurn: completed,
      })
      expect(agentFinish(working, asking)).toBeUndefined()
    })
  })

  context("when nothing tells it finished", () => {
    it("never finishes from idle, nor before any turn ended", () => {
      const idle = agent({ working: false, lastTurn: completed })
      expect(agentFinish(idle, idle)).toBeUndefined()
      expect(agentFinish(undefined, idle)).toBeUndefined()
      expect(agentFinish(working, agent({ working: false }))).toBeUndefined()
    })

    it("never finishes when NovaDeck can't hear from it, or it went away", () => {
      const unheard: TerminalMetadata = { ...base, state: "running" }
      expect(agentFinish(working, unheard)).toBeUndefined()
      expect(agentFinish(working, { ...base, state: "idle", process: "zsh" })).toBeUndefined()
    })
  })
})

describe("an agent resuming", () => {
  it("resumes when a new turn starts after it was idle", () => {
    const idle = agent({ working: false, lastTurn: completed })
    expect(agentResumed(idle, working)).toBe(true)
    expect(agentResumed(working, working)).toBe(false)
    expect(agentResumed(working, idle)).toBe(false)
  })
})

describe("a finish's notice", () => {
  it("names the terminal by its handle and title, and says the start of the reply", () => {
    const terminal = { ...working, handle: "t1", name: "Checkout review" }
    expect(finishNotice(terminal, { reply: "All green." })).toEqual({
      title: "t1 is done: Checkout review",
      body: "All green.",
    })
  })

  it("falls back to its title alone, and a plain body where no reply was told", () => {
    expect(finishNotice({ ...working, name: "Tests" }, {})).toEqual({
      title: "Tests is done",
      body: "Finished its turn.",
    })
  })
})
