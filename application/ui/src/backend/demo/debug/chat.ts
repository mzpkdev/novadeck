import {
  conflictFailure,
  type ConflictReason,
  type Conversations,
} from "../../../model/conversation"
import type { DemoAction } from "./types"

// The ways the runner turns a chat's send away, which the demo's agents never do of their
// own accord: one can be armed for the next send, which fails as the runner's would.
const failures: readonly {
  readonly reason: ConflictReason
  readonly label: string
  readonly hint: string
}[] = [
  {
    reason: "draft",
    label: "Next send: box holds a draft",
    hint: "The send fails, its words back in the box, with Open terminal",
  },
  {
    reason: "shell",
    label: "Next send: box in shell mode",
    hint: "The send fails with Open terminal",
  },
  {
    reason: "too-tall",
    label: "Next send: too tall for the box",
    hint: "The send fails with Open terminal",
  },
  {
    reason: "no-box",
    label: "Next send: no box on screen",
    hint: "The send fails with Open terminal",
  },
  {
    reason: "ringing",
    label: "Next send: doorbell ringing",
    hint: "The send fails, saying to send again in a moment, without Open terminal",
  },
]

// Wraps the demo's conversations so a failure armed from the panel meets the next send.
export const createDebugChat = (): {
  readonly wrap: (conversations: Conversations) => Conversations
  readonly actions: readonly DemoAction[]
} => {
  let armed: ConflictReason | undefined
  return {
    wrap: (conversations) => ({
      ...conversations,
      send: async (key, text) => {
        const reason = armed
        armed = undefined
        if (reason) throw conflictFailure(reason)
        return conversations.send(key, text)
      },
    }),
    actions: failures.map(({ reason, label, hint }) => ({
      label,
      hint,
      run: () => {
        armed = reason
      },
    })),
  }
}
