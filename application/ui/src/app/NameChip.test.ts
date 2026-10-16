import { act, createElement } from "react"
import { afterEach, beforeEach, vi } from "vitest"

import type { Murmur, MurmurState } from "../model/murmur"
import { createStore } from "../model/store"
import type { AgentStatus } from "../model/types"
import { context, describe, expect, it } from "../test"
import { openCommands } from "../test/commands"
import { render } from "../test/render"
import { WorkspaceServicesContext, type WorkspaceServices } from "./controller/context"
import { NameChip } from "./NameChip"
import { NameOffer } from "./NameOffer"

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
  unchecked: false,
  offers: 0,
  failure: null,
}

const target = { projectId: "project", workspaceSessionId: "initial" }
const finished = { context: "project/initial", id: "02" }

// The services the chip and its watcher read: the real stores and commands over a fixture
// (test/commands.ts), and a murmur that records.
const setup = () => {
  const { workspace, ui, commands } = openCommands()
  workspace.dispatch({
    type: "view/change",
    target,
    view: "focus",
    enabledViews: ["focus", "grid"],
  })
  const set = vi.fn<Murmur["set"]>()
  const murmur: Murmur = {
    state: createStore(offered),
    install: vi.fn<() => void>(),
    cancel: vi.fn<() => void>(),
    uninstall: () => Promise.resolve(),
    set,
  }
  const services = { backend: { murmur }, workspace, ui, commands } as unknown as WorkspaceServices
  const status = (agent: AgentStatus) =>
    workspace.dispatch({
      type: "terminal/status",
      target,
      terminalId: "02",
      status: { state: "running", agent },
    })
  const mount = (children: ReturnType<typeof createElement>) =>
    render(createElement(WorkspaceServicesContext.Provider, { value: services }, children))
  return { workspace, ui, set, commands, status, mount }
}

const chip = () => document.querySelector<HTMLButtonElement>("button.name-chip")

describe("the offer chip counts the session once it is seen", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("counts and marks the run when it is drawn, once, though it is drawn again", () => {
    const { ui, set, commands, mount } = setup()
    commands.offerNameTo(finished)
    const first = mount(createElement(NameChip, { terminalId: "02", context: "project/initial" }))
    expect(chip()).not.toBeNull()
    expect(set).toHaveBeenCalledExactlyOnceWith({ offered: true })
    expect(ui.getSnapshot().addonOfferShown).toBe(true)
    first.unmount()

    // A switch of view draws the window again: it is not counted twice.
    const second = mount(createElement(NameChip, { terminalId: "02", context: "project/initial" }))
    expect(chip()).not.toBeNull()
    expect(set).toHaveBeenCalledOnce()
    second.unmount()
  })

  it("counts nothing until the chip is in view, as one panned out of the Canvas is not", () => {
    const seen: IntersectionObserverCallback[] = []
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          seen.push(callback)
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    const { ui, set, commands, mount } = setup()
    commands.offerNameTo(finished)
    const { unmount } = mount(
      createElement(NameChip, { terminalId: "02", context: "project/initial" }),
    )
    expect(set).not.toHaveBeenCalled()
    expect(ui.getSnapshot().addonOfferShown).toBe(false)

    act(() => {
      seen[0]?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(set).toHaveBeenCalledExactlyOnceWith({ offered: true })
    expect(ui.getSnapshot().addonOfferShown).toBe(true)
    unmount()
  })
})

describe("the chip and another offer's mark", () => {
  const stubSeen = (): IntersectionObserverCallback[] => {
    const seen: IntersectionObserverCallback[] = []
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          seen.push(callback)
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    return seen
  }
  afterEach(() => vi.unstubAllGlobals())

  it("stops drawing a chip that was not seen once voice input's offer took the run's mark", () => {
    stubSeen()
    const { ui, set, commands, mount } = setup()
    commands.offerNameTo(finished)
    const { unmount } = mount(
      createElement(NameChip, { terminalId: "02", context: "project/initial" }),
    )
    expect(chip()).not.toBeNull()

    // Panned into view only later, the run was already claimed: it never shows, uncounted.
    act(() => commands.markAddonOfferShown())
    expect(chip()).toBeNull()
    expect(set).not.toHaveBeenCalled()
    expect(ui.getSnapshot().nameOffer).not.toBeNull()
    unmount()
  })

  it("keeps a chip that was counted when voice input's offer comes after, as it was asked for", () => {
    const { set, commands, mount } = setup()
    commands.offerNameTo(finished)
    const { unmount } = mount(
      createElement(NameChip, { terminalId: "02", context: "project/initial" }),
    )
    expect(set).toHaveBeenCalledOnce()

    act(() => commands.markAddonOfferShown())
    expect(chip()).not.toBeNull()
    expect(set).toHaveBeenCalledOnce()
    unmount()
  })
})

describe("the watcher that puts the chip on a terminal", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const finish = async (status: ReturnType<typeof setup>["status"]) => {
    status({ working: true })
    status({ working: false, lastTurn: { outcome: "completed", reply: "Done.", at: 10 } })
    await vi.advanceTimersByTimeAsync(1000)
  }

  context("when a finish qualifies", () => {
    it("targets that terminal, and counts nothing before the chip is drawn", async () => {
      const { workspace, ui, set, status, mount } = setup()
      workspace.dispatch({ type: "terminal/select", target, terminalId: "02" })
      const { unmount } = mount(createElement(NameOffer))
      await finish(status)

      expect(ui.getSnapshot().nameOffer).toEqual(finished)
      expect(ui.getSnapshot().addonOfferShown).toBe(false)
      expect(set).not.toHaveBeenCalled()
      unmount()
    })
  })

  context("when a finish is let go", () => {
    it("neither targets nor counts a terminal whose title someone gave", async () => {
      const { workspace, ui, set, status, mount } = setup()
      workspace.dispatch({ type: "terminal/select", target, terminalId: "02" })
      workspace.dispatch({
        type: "terminal/update",
        target,
        terminalId: "02",
        titleSource: { kind: "person" },
      })
      const { unmount } = mount(createElement(NameOffer))
      await finish(status)

      expect(ui.getSnapshot().nameOffer).toBeNull()
      expect(ui.getSnapshot().addonOfferShown).toBe(false)
      expect(set).not.toHaveBeenCalled()
      unmount()
    })

    it("never targets one once voice input's offer has come up", async () => {
      const { workspace, ui, set, commands, status, mount } = setup()
      workspace.dispatch({ type: "terminal/select", target, terminalId: "02" })
      commands.markAddonOfferShown()
      const { unmount } = mount(createElement(NameOffer))
      await finish(status)

      expect(ui.getSnapshot().nameOffer).toBeNull()
      expect(set).not.toHaveBeenCalled()
      unmount()
    })

    it("lets go of a finish in Focus of a terminal that is not the one shown", async () => {
      const { workspace, ui, status, mount } = setup()
      workspace.dispatch({
        type: "view/change",
        target,
        view: "focus",
        enabledViews: ["focus", "grid"],
      })
      workspace.dispatch({ type: "terminal/select", target, terminalId: "01" })
      const { unmount } = mount(createElement(NameOffer))
      await finish(status)

      expect(ui.getSnapshot().nameOffer).toBeNull()
      unmount()
    })
  })
})
