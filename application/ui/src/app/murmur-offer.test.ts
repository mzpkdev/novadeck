import { afterEach, beforeEach, vi } from "vitest"

import type { MurmurState } from "../model/murmur"
import { createWorkspaceStore } from "../model/store"
import type { AgentStatus } from "../model/types"
import { context, describe, expect, it } from "../test"
import { workspaceFixture } from "../test/fixtures"
import {
  offerable,
  offerDue,
  offerSessions,
  canCarryChip,
  offerText,
  plainTitle,
  watchAgentFinishes,
} from "./murmur-offer"

const offered: MurmurState = {
  available: true,
  installed: false,
  enabled: false,
  wanted: true,
  sizes: { engine: 34 * 1024 * 1024, model: 1222 * 1024 * 1024 },
  installing: null,
  check: null,
  unsupported: null,
  recheck: false,
  offers: 0,
  failure: null,
}

describe("the Murmur offer's conditions", () => {
  it("stands for a computer with the engine, no install, and no refusal", () => {
    expect(offerable(offered)).toBe(true)
    expect(offerDue(offered)).toBe(true)
  })

  it.each([
    ["installed", { installed: true }],
    ["declined", { wanted: false }],
    ["known not to run murmur", { unsupported: "No graphics device answered." }],
    ["without an engine for the platform", { available: false }],
    ["installing", { installing: { step: "engine" as const, received: 0, total: 1 } }],
    ["after a failure", { failure: "Couldn't reach the download." }],
  ])("does not stand when %s", (_name, change) => {
    expect(offerable({ ...offered, ...change })).toBe(false)
  })

  it("is due until it was shown in three sessions, though it still stands", () => {
    expect(offerDue({ ...offered, offers: offerSessions - 1 })).toBe(true)
    expect(offerable({ ...offered, offers: offerSessions })).toBe(true)
    expect(offerDue({ ...offered, offers: offerSessions })).toBe(false)
  })
})

describe("which titles the chip is offered beside", () => {
  it("takes the plain name of the agent or program, not one anyone gave", () => {
    expect(plainTitle({})).toBe(true)
    expect(plainTitle({ titleSource: { kind: "default" } })).toBe(true)
    expect(plainTitle({ titleSource: { kind: "person" } })).toBe(false)
    expect(plainTitle({ titleSource: { kind: "agent", by: "claude" } })).toBe(false)
    expect(plainTitle({ titleSource: { kind: "murmur" } })).toBe(false)
  })
})

describe("which finished terminal may carry the chip", () => {
  const target = { projectId: "project", workspaceSessionId: "initial" }
  const finished = { context: "project/initial", id: "02" }

  const inView = (view: "focus" | "grid") => {
    const workspace = createWorkspaceStore(workspaceFixture())
    workspace.dispatch({
      type: "view/change",
      target,
      view,
      enabledViews: ["focus", "grid", "canvas"],
    })
    workspace.dispatch({ type: "terminal/select", target, terminalId: "01" })
    return workspace
  }

  it("takes the one shown in Focus, under its plain name", () => {
    const workspace = inView("focus")
    workspace.dispatch({ type: "terminal/select", target, terminalId: "02" })
    expect(canCarryChip(workspace.getSnapshot(), finished)).toBe(true)
  })

  it("lets go of a finish in Focus of a terminal that is not the one shown", () => {
    expect(canCarryChip(inView("focus").getSnapshot(), finished)).toBe(false)
  })

  it("takes any terminal in Grid that is not hidden from it", () => {
    const workspace = inView("grid")
    expect(canCarryChip(workspace.getSnapshot(), finished)).toBe(true)
    workspace.dispatch({ type: "terminal/visibility", target, terminalId: "02", hidden: true })
    expect(canCarryChip(workspace.getSnapshot(), finished)).toBe(false)
  })

  it("lets go of a title someone gave", () => {
    const workspace = createWorkspaceStore(workspaceFixture())
    workspace.dispatch({ type: "terminal/select", target, terminalId: "02" })
    for (const titleSource of [
      { kind: "person" },
      { kind: "agent", by: "claude" },
      { kind: "murmur" },
    ] as const) {
      workspace.dispatch({ type: "terminal/update", target, terminalId: "02", titleSource })
      expect(canCarryChip(workspace.getSnapshot(), finished)).toBe(false)
    }
  })

  it("lets go of a finish in a session that is not on screen, or a terminal that is gone", () => {
    const workspace = createWorkspaceStore(workspaceFixture())
    workspace.dispatch({ type: "terminal/select", target, terminalId: "02" })
    expect(canCarryChip(workspace.getSnapshot(), { context: "other/background", id: "02" })).toBe(
      false,
    )
    expect(canCarryChip(workspace.getSnapshot(), { ...finished, id: "99" })).toBe(false)
  })
})

describe("what the offer says", () => {
  it("names the chip, and the popover's download size, never GPU", () => {
    expect(offerText.chip).toBe("Name it for me")
    expect(offerText.body(offered)).toBe(
      "A small model on this computer reads the agent's work and names each terminal. 1.2 GB once.",
    )
    expect(JSON.stringify(offerText)).not.toMatch(/GPU/)
  })
})

describe("watching for the first finished turn", () => {
  const target = { projectId: "project", workspaceSessionId: "initial" }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = () => {
    const workspace = createWorkspaceStore(workspaceFixture())
    const status = (terminalId: string, agent: AgentStatus) =>
      workspace.dispatch({
        type: "terminal/status",
        target,
        terminalId,
        status: { state: "running", agent },
      })
    status("02", { working: true })
    let finishes = 0
    let last: { context: string; id: string } | undefined
    const stop = watchAgentFinishes(
      workspace,
      (terminal) => {
        finishes += 1
        last = terminal
      },
      100,
    )
    const end = (at: number, outcome: "completed" | "failed" | "interrupted" = "completed") =>
      status("02", { working: false, lastTurn: { outcome, reply: "Done.", at } })
    return { workspace, status, end, finishes: () => finishes, last: () => last, stop }
  }

  context("when an agent's turn ends complete", () => {
    it("tells once, with the terminal and its session, after the grace", async () => {
      const { end, finishes, last, stop } = setup()
      end(10)
      expect(finishes()).toBe(0)
      await vi.advanceTimersByTimeAsync(150)
      expect(finishes()).toBe(1)
      expect(last()).toEqual({ context: "project/initial", id: "02" })
      stop()
    })

    it("tells nothing when the person's Escape turned it interrupted meanwhile", async () => {
      const { end, finishes, stop } = setup()
      end(10)
      end(10, "interrupted")
      await vi.advanceTimersByTimeAsync(150)
      expect(finishes()).toBe(0)
      stop()
    })
  })

  it("tells nothing for a failed turn, nor for an end shown when it started", async () => {
    const { end, finishes, stop } = setup()
    end(10, "failed")
    await vi.advanceTimersByTimeAsync(150)
    expect(finishes()).toBe(0)
    stop()

    const workspace = createWorkspaceStore(workspaceFixture())
    workspace.dispatch({
      type: "terminal/status",
      target,
      terminalId: "02",
      status: {
        state: "running",
        agent: { working: false, lastTurn: { outcome: "completed", at: 5 } },
      },
    })
    let told = 0
    const again = watchAgentFinishes(workspace, () => (told += 1), 0)
    workspace.dispatch({ type: "terminal/select", target, terminalId: "01" })
    await vi.advanceTimersByTimeAsync(50)
    expect(told).toBe(0)
    again()
  })

  it("stops telling once unsubscribed", async () => {
    const { end, finishes, stop } = setup()
    end(10)
    stop()
    await vi.advanceTimersByTimeAsync(150)
    expect(finishes()).toBe(0)
  })
})
