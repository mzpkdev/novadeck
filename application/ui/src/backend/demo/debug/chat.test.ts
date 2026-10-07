import { describe, expect, it } from "vitest"

import { noConversation, SettleInTerminal, type Conversations } from "../../../model/conversation"
import { createDebugChat } from "./chat"

const key = { projectId: "p", workspaceSessionId: "s", terminalId: "01" }

describe("the debug panel's chat failures", () => {
  it("fail the next send once, as the runner would, then let sends through", async () => {
    const sent: string[] = []
    const inner: Conversations = {
      conversation: () => ({ getSnapshot: () => noConversation, subscribe: () => () => {} }),
      send: async (_key, text) => void sent.push(text),
      interrupt: async () => null,
      answer: async () => {},
      refused: () => false,
    }
    const chat = createDebugChat()
    const conversations = chat.wrap(inner)
    const draft = chat.actions.find((action) => action.label.includes("draft"))!
    await draft.run({} as never)
    await expect(conversations.send(key, "one")).rejects.toBeInstanceOf(SettleInTerminal)
    await conversations.send(key, "two")
    expect(sent).toEqual(["two"])
    const ringing = chat.actions.find((action) => action.label.includes("doorbell"))!
    await ringing.run({} as never)
    await expect(conversations.send(key, "three")).rejects.toThrow("in a moment")
  })
})
