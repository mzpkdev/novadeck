import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { workspaceFromSeed } from "../../../model/seed"
import type { Workspace } from "../../../model/types"
import type { DemoAgentVerbs } from "../agent-link"
import { demoSeed, demoTerminalId } from "../samples"
import { visitorBeats } from "./beats"
import { visitorDemo } from "./index"
import { playScenario, selectedKey, stillCheckMs, type Beat, type Stage } from "./scenario"

const workspace: Workspace = workspaceFromSeed(demoSeed(0, true), {
  view: "grid",
  windowedView: "grid",
  now: 0,
})
// Every sample project's terminals, by project and number.
const at = (projectId: string, slot: number) => {
  const target = { projectId, workspaceSessionId: "initial" }
  return { ...target, terminalId: demoTerminalId(target, slot) }
}
const selected = selectedKey(workspace)!

const verbs = () => {
  const finish = vi.fn<DemoAgentVerbs["finish"]>()
  return {
    finish,
    all: {
      work: vi.fn<DemoAgentVerbs["work"]>(),
      ask: vi.fn<DemoAgentVerbs["ask"]>(),
      finish,
      rest: vi.fn<DemoAgentVerbs["rest"]>(),
      usage: vi.fn<DemoAgentVerbs["usage"]>(),
      release: vi.fn<DemoAgentVerbs["release"]>(),
    },
  }
}
const finishing: Beat["play"] = (played, key, terminal) => played.finish(key, terminal, "completed")

const stageOf = (all: DemoAgentVerbs, change: Partial<Stage> = {}): Stage => ({
  verbs: all,
  workspace: () => workspace,
  working: () => false,
  still: () => true,
  ...change,
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("the visitor scenario", () => {
  it("plays each beat when it is due", () => {
    const played = verbs()
    playScenario(
      [
        { after: 1000, on: [at("infra", 1)], play: finishing },
        { after: 500, on: [at("docs-site", 1)], play: finishing },
      ],
      stageOf(played.all),
    )

    vi.advanceTimersByTime(999)
    expect(played.finish).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(played.finish).toHaveBeenCalledOnce()
    expect(played.finish.mock.calls[0]![0]).toEqual(at("infra", 1))
    vi.advanceTimersByTime(500)
    expect(played.finish).toHaveBeenCalledTimes(2)
  })

  describe("when a beat's terminal is the one selected", () => {
    it("acts on its next candidate instead", () => {
      const played = verbs()
      playScenario(
        [{ after: 100, on: [selected, at("infra", 1)], play: finishing }],
        stageOf(played.all),
      )

      vi.advanceTimersByTime(100)

      expect(played.finish).toHaveBeenCalledOnce()
      expect(played.finish.mock.calls[0]![0]).toEqual(at("infra", 1))
    })

    it("is skipped when it has no other, and the next beat still plays", () => {
      const played = verbs()
      playScenario(
        [
          { after: 100, on: [selected], play: finishing },
          { after: 100, on: [at("infra", 1)], play: finishing },
        ],
        stageOf(played.all),
      )

      vi.advanceTimersByTime(100)
      expect(played.finish).not.toHaveBeenCalled()
      vi.advanceTimersByTime(100)
      expect(played.finish).toHaveBeenCalledOnce()
    })
  })

  it("leaves a terminal whose turn the person started", () => {
    const played = verbs()
    playScenario(
      [{ after: 100, on: [at("infra", 1)], play: finishing }],
      stageOf(played.all, { working: (key) => key.projectId === "infra" }),
    )

    vi.advanceTimersByTime(100)

    expect(played.finish).not.toHaveBeenCalled()
  })

  it("leaves a terminal the workspace does not hold", () => {
    const played = verbs()
    playScenario([{ after: 100, on: [at("elsewhere", 1)], play: finishing }], stageOf(played.all))

    vi.advanceTimersByTime(100)

    expect(played.finish).not.toHaveBeenCalled()
  })

  describe("while the person interacts", () => {
    it("holds the beat until they are still, then plays it", () => {
      const played = verbs()
      let still = false
      playScenario(
        [{ after: 100, on: [at("infra", 1)], play: finishing }],
        stageOf(played.all, { still: () => still }),
      )

      vi.advanceTimersByTime(100 + 3 * stillCheckMs)
      expect(played.finish).not.toHaveBeenCalled()
      still = true
      vi.advanceTimersByTime(stillCheckMs)
      expect(played.finish).toHaveBeenCalledOnce()
    })
  })

  it("plays nothing once stopped", () => {
    const played = verbs()
    const stop = playScenario(
      [{ after: 100, on: [at("infra", 1)], play: finishing }],
      stageOf(played.all),
    )

    stop()
    vi.advanceTimersByTime(10_000)

    expect(played.finish).not.toHaveBeenCalled()
  })

  it("names only terminals the agents demo has, and stops in a couple of minutes", () => {
    const held = new Set(
      workspace.projects.flatMap((project) =>
        project.history[0]!.state.roster.terminals.map(
          (terminal) => `${project.id}/${terminal.id}`,
        ),
      ),
    )
    for (const beat of visitorBeats)
      for (const key of beat.on) expect(held.has(`${key.projectId}/${key.terminalId}`)).toBe(true)
    expect(visitorBeats.reduce((total, beat) => total + beat.after, 0)).toBeLessThan(180_000)
  })
})

describe("the visitor demo", () => {
  it("offers no debug panel, chat, voice or agent connections", () => {
    const backend = visitorDemo()

    expect(backend.visitor).toBeDefined()
    expect(backend.DebugPanel).toBeUndefined()
    expect(backend.conversations).toBeUndefined()
    expect(backend.voice).toBeUndefined()
    expect(backend.agents).toBeUndefined()
  })
})
