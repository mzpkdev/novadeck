import { afterEach, beforeEach, vi } from "vitest"

import { inboxType, type InboxItem } from "../../model/inbox"
import { context, describe, expect, it } from "../../test"
import { answerMs, createDemoInbox, demoInboxIds, demoInboxItems, isDemoInbox } from "./inbox"
import { createDemo } from "./variants"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const now = 1_000_000_000_000

const ids = (inbox: ReturnType<typeof createDemoInbox>): string[] =>
  inbox.state.getSnapshot().items.map((each) => each.id)

describe("the demo Inbox's items", () => {
  it("covers every type, each kind and every ask shape", () => {
    const items = demoInboxItems(now)
    expect(new Set(items.map(inboxType))).toEqual(new Set(["approve", "ask", "trouble", "update"]))
    expect(new Set(items.map((each) => each.kind))).toEqual(
      new Set(["request", "held", "ask", "trouble", "update"]),
    )
    const shapes = items.flatMap((each) => (each.kind === "ask" ? [each.ask.shape.type] : []))
    expect(new Set(shapes)).toEqual(new Set(["options", "secret", "action"]))
  })

  it("puts one item on each sample terminal, none seen, none from the future", () => {
    const items = demoInboxItems(now)
    const terminals = items.map((each) => each.source.terminalId)
    expect(new Set(terminals).size).toBe(terminals.length)
    expect(items.every((each) => !each.seen && each.at <= now)).toBe(true)
  })

  it("gives the Codex permission Codex's own options", () => {
    const codex = demoInboxItems(now).find((each) => each.id === demoInboxIds.codexPermission)
    const dialog = codex?.kind === "request" ? codex.request.dialog : null
    expect(dialog?.type === "choices" ? dialog.options.map((each) => each.label) : []).toEqual([
      "Yes, proceed",
      "Yes, and don't ask again for commands that start with `pnpm add`",
      "No, continue without running it",
      "No, and tell Codex what to do differently",
    ])
  })
})

describe("the demo Inbox", () => {
  context("when an answer is sent", () => {
    it("marks the item answering, then removes it", () => {
      const inbox = createDemoInbox(now)
      inbox.answer(demoInboxIds.held, { kind: "held", action: "release" })
      expect(inbox.state.getSnapshot().answering).toEqual({ [demoInboxIds.held]: true })
      expect(ids(inbox)).toContain(demoInboxIds.held)
      vi.advanceTimersByTime(answerMs)
      expect(inbox.state.getSnapshot().answering).toEqual({})
      expect(ids(inbox)).not.toContain(demoInboxIds.held)
    })

    it("ignores an item that is not there", () => {
      const inbox = createDemoInbox(now)
      const before = inbox.state.getSnapshot()
      inbox.answer("nothing", { kind: "held", action: "stop" })
      expect(inbox.state.getSnapshot()).toBe(before)
    })

    it("fails an answer meant for another kind of item, leaving the item", () => {
      const inbox = createDemoInbox(now)
      inbox.answer(demoInboxIds.held, { kind: "update", action: "read" })
      vi.advanceTimersByTime(answerMs)
      expect(ids(inbox)).toContain(demoInboxIds.held)
      expect(Object.keys(inbox.state.getSnapshot().failed)).toEqual([demoInboxIds.held])
    })
  })

  context("when auto-resume is turned off at a limit", () => {
    it("keeps the item, now waiting on the person", () => {
      const inbox = createDemoInbox(now)
      inbox.answer(demoInboxIds.limit, {
        kind: "trouble",
        action: { type: "auto-resume", on: false },
      })
      vi.advanceTimersByTime(answerMs)
      const limit = inbox.state.getSnapshot().items.find((each) => each.id === demoInboxIds.limit)
      expect(limit?.stopped).toBe(true)
      expect(limit?.kind === "trouble" && limit.trouble.type === "limit").toBe(true)
      expect(
        limit?.kind === "trouble" && limit.trouble.type === "limit" && limit.trouble.autoResume,
      ).toBe(false)
      expect(inbox.state.getSnapshot().answering).toEqual({})
    })
  })

  context("when an item is seen", () => {
    it("marks only that item", () => {
      const inbox = createDemoInbox(now)
      inbox.see(demoInboxIds.stuck)
      const seen = inbox.state.getSnapshot().items.filter((each) => each.seen)
      expect(seen.map((each) => each.id)).toEqual([demoInboxIds.stuck])
    })
  })

  context("when every update is read", () => {
    it("removes the updates and nothing that waits", () => {
      const inbox = createDemoInbox(now)
      const waiting = demoInboxItems(now).filter((each) => each.kind !== "update")
      inbox.readAll()
      expect(ids(inbox)).toEqual(waiting.map((each) => each.id))
    })
  })

  context("when an item arrives", () => {
    it("joins the Inbox, replacing one with its ID, until it is cleared", () => {
      const inbox = createDemoInbox(now, [])
      const [first] = demoInboxItems(now) as [InboxItem]
      inbox.add(first)
      inbox.add({ ...first, at: now + 1 })
      expect(inbox.state.getSnapshot().items).toEqual([{ ...first, at: now + 1 }])
      inbox.clear()
      expect(ids(inbox)).toEqual([])
    })
  })
})

describe("the demo variants' Inbox", () => {
  it("is in the inbox variant alone", () => {
    expect(isDemoInbox(createDemo("inbox").inbox)).toBe(true)
    for (const variant of ["showcase", "plain", "agents", "messages", "welcome"] as const)
      expect(createDemo(variant).inbox).toBeUndefined()
  })
})
