import { afterEach, beforeEach, vi } from "vitest"

import type { MurmurState } from "../model/murmur"
import { createWorkspaceStore } from "../model/store"
import type { AgentStatus } from "../model/types"
import { context, describe, expect, it } from "../test"
import { workspaceFixture } from "../test/fixtures"
import { offerable, offerText, offerView, watchAgentFinishes, workingText } from "./murmur-offer"

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
  failure: null,
}

const checked: MurmurState = {
  ...offered,
  installed: true,
  enabled: true,
  check: { device: "Intel Arc Graphics", integrated: true, milliseconds: 5000 },
}

describe("the Murmur offer's conditions", () => {
  it("is made to a computer with the engine, no install, and no refusal", () => {
    expect(offerable(offered)).toBe(true)
  })

  it.each([
    ["installed", { installed: true }],
    ["declined", { wanted: false }],
    ["known not to run murmur", { unsupported: "No graphics device answered." }],
    ["without an engine for the platform", { available: false }],
    ["installing", { installing: { step: "engine" as const, received: 0, total: 1 } }],
    ["after a failure", { failure: "Couldn't reach the download." }],
  ])("is not made when %s", (_name, change) => {
    expect(offerable({ ...offered, ...change })).toBe(false)
  })
})

describe("what the open Murmur card shows", () => {
  it("offers until Turn on, then shows the install as it goes", () => {
    expect(offerView(offered, false)).toBe("offer")
    expect(offerView(offered, true)).toBe("working")
    expect(
      offerView({ ...offered, installing: { step: "model", received: 5, total: 9 } }, true),
    ).toBe("working")
  })

  it("ends in done only for an install the card started", () => {
    expect(offerView(checked, true)).toBe("done")
    expect(offerView(checked, false)).toBe("gone")
  })

  it("shows a failure, with the way to try again", () => {
    expect(offerView({ ...offered, failure: "The download stopped." }, true)).toBe("failed")
  })

  it("leaves for good when the computer can't run it", () => {
    expect(offerView({ ...offered, unsupported: "No graphics device answered." }, true)).toBe(
      "gone",
    )
    expect(offerView({ ...offered, installing: null, unsupported: "x" }, false)).toBe("gone")
  })

  it("says what the step under way is, never GPU", () => {
    expect(workingText(offered)).toBe("Starting…")
    expect(
      workingText({
        ...offered,
        installing: { step: "model", received: 1024 ** 2, total: 2 * 1024 ** 2 },
      }),
    ).toBe("Downloading model · 1 MB of 2 MB")
    expect(workingText({ ...offered, installing: { step: "check", received: 0, total: 0 } })).toBe(
      "Checking this computer",
    )
    expect(JSON.stringify(offerText)).not.toMatch(/GPU/)
    expect(offerText.body(offered)).toBe(
      "A small model on this computer reads what agents are doing and names each terminal. Downloads 1.2 GB once.",
    )
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
    const stop = watchAgentFinishes(workspace, () => (finishes += 1), 100)
    const end = (at: number, outcome: "completed" | "failed" | "interrupted" = "completed") =>
      status("02", { working: false, lastTurn: { outcome, reply: "Done.", at } })
    return { workspace, status, end, finishes: () => finishes, stop }
  }

  context("when an agent's turn ends complete", () => {
    it("tells once the end still stands after the grace", async () => {
      const { end, finishes, stop } = setup()
      end(10)
      expect(finishes()).toBe(0)
      await vi.advanceTimersByTimeAsync(150)
      expect(finishes()).toBe(1)
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
