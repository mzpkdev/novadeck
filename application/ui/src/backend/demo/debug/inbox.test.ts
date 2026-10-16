import { describe, expect, it } from "../../../test"
import { createDemoInbox, demoInboxIds } from "../inbox"
import { inboxGroups } from "./inbox"
import type { DemoActionContext } from "./types"

const run = (inbox: ReturnType<typeof createDemoInbox>, label: string, notes: string[] = []) => {
  const [group] = inboxGroups(inbox)
  const context: DemoActionContext = {
    target: "selected",
    selected: () => undefined,
    addTerminal: () => {
      throw new Error("unused")
    },
    addInBackground: () => {
      throw new Error("unused")
    },
    startFresh: () => undefined,
    dispatch: undefined,
    workspace: () => undefined,
    note: (text) => notes.push(text),
  }
  void group!.actions.find((action) => action.label === label)!.run(context)
}

describe("the debug panel's Inbox group", () => {
  it("is absent where the demo has no Inbox", () => {
    expect(inboxGroups(undefined)).toEqual([])
  })

  it("hints what each action shows", () => {
    const [group] = inboxGroups(createDemoInbox(1, []))
    expect(group!.actions.every((action) => action.hint.length > 0)).toBe(true)
  })

  it("adds one item of a kind, waiting from now", () => {
    const inbox = createDemoInbox(1, [])
    run(inbox, "Stuck agent")
    const [added] = inbox.state.getSnapshot().items
    expect(added?.kind).toBe("trouble")
    expect(added?.at).toBeGreaterThan(1_000_000_000_000)
  })

  it("adds the next kind that is missing, until every kind is there", () => {
    const inbox = createDemoInbox(1, [])
    const notes: string[] = []
    // Every action but the reset limit, the two failing answers, the arrival and the clear adds a kind.
    const kinds = inboxGroups(inbox)[0]!.actions.length - 5
    for (let each = 0; each < kinds; each += 1) run(inbox, "A new item arrives", notes)
    expect(inbox.state.getSnapshot().items).toHaveLength(kinds)
    run(inbox, "A new item arrives", notes)
    expect(notes).toEqual(["Every kind is in the Inbox already."])
  })

  it("makes the next answer fail", () => {
    const inbox = createDemoInbox(1)
    run(inbox, "Fail the next answer")
    inbox.answer(inbox.state.getSnapshot().items[0]!.id, { kind: "update", action: "read" })

    expect(Object.keys(inbox.state.getSnapshot().failed)).toHaveLength(1)
  })

  it("makes the next answer report that its ask is no longer available", () => {
    const inbox = createDemoInbox(1)
    run(inbox, "Stale next answer")
    inbox.answer(demoInboxIds.preview, {
      kind: "ask",
      answer: { type: "reply", option: null, text: "Sample products." },
    })

    expect(inbox.state.getSnapshot().failed[demoInboxIds.preview]).toBe(
      "That ask is no longer available.",
    )
    expect(inbox.state.getSnapshot().items.some((item) => item.id === demoInboxIds.preview)).toBe(
      true,
    )
    expect(inbox.state.getSnapshot().answering).toEqual({})
  })

  it("clears the Inbox", () => {
    const inbox = createDemoInbox(1)
    run(inbox, "Clear the Inbox")
    expect(inbox.state.getSnapshot().items).toEqual([])
  })
})
