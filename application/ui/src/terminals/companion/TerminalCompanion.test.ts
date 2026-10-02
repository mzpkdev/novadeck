import { act, createElement, type ComponentProps } from "react"
import { afterEach } from "vitest"

import type {
  ArtifactRef,
  CompanionEvent,
  CompanionKey,
  CompanionSnapshot,
  Companions,
} from "../../model/companion"
import { context, describe, expect, it } from "../../test"
import { render } from "../../test/render"
import { TerminalCompanion } from "./TerminalCompanion"

const unmounts: (() => void)[] = []
afterEach(() => unmounts.splice(0).forEach((unmount) => unmount()))

const key: CompanionKey = { projectId: "p", workspaceSessionId: "s", terminalId: "01" }
const hero: ArtifactRef = { id: "hero", kind: "image", name: "hero.png", detail: "", version: 1 }

// Companions that start from `shown` and report what `emit` is given.
const companionsOf = (shown: readonly ArtifactRef[]) => {
  const listeners = new Set<(event: CompanionEvent) => void>()
  const snapshot: CompanionSnapshot[] = shown.length ? [{ key, plans: [], shown }] : []
  const companions: Companions = {
    snapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load: () => new Promise(() => {}),
    save: () => Promise.reject(new Error("No plans")),
  }
  // Async, so the presence's microtask, which marks a change after mount, runs too.
  const emit = (event: CompanionEvent) =>
    act(async () => listeners.forEach((listener) => listener(event)))
  return { companions, emit }
}

const renderTerminal = (companions: Companions): HTMLElement => {
  const props: ComponentProps<typeof TerminalCompanion> = {
    companions,
    peerName: () => undefined,
    companionKey: key,
    view: "focus",
    children: null,
  }
  const { container, unmount } = render(createElement(TerminalCompanion, props))
  unmounts.push(unmount)
  return container
}

const taskbar = (container: HTMLElement) => container.querySelector(".plan-taskbar")

describe("a terminal's taskbar", () => {
  context("when the agent first shows something", () => {
    it("appears marked open, so it animates in", async () => {
      const { companions, emit } = companionsOf([])
      const container = renderTerminal(companions)
      expect(taskbar(container)).toBeNull()
      await emit({ type: "artifact/shown", key, artifact: hero, asked: false })
      expect(taskbar(container)?.getAttribute("data-state")).toBe("open")
    })
  })

  context("when the terminal already had something to show as it mounted", () => {
    it("appears as it was, without animating", () => {
      const { companions } = companionsOf([hero])
      const container = renderTerminal(companions)
      expect(taskbar(container)).not.toBeNull()
      expect(taskbar(container)?.hasAttribute("data-state")).toBe(false)
    })
  })
})
