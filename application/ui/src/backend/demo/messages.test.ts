import { companionKeyId } from "../../model/companion"
import { mailBadge } from "../../model/messages"
import { describe, expect, it } from "../../test"
import { checkoutMailboxes, createDemoMessages } from "./messages"

const storefront = { projectId: "storefront", workspaceSessionId: "initial" }
const elsewhere = { projectId: "api-service", workspaceSessionId: "initial" }
const at = (terminalId: string, target = storefront) => companionKeyId({ ...target, terminalId })

const demo = () => createDemoMessages(checkoutMailboxes(1_000_000, [storefront, elsewhere]))

describe("the demo's messages", () => {
  it("show every state, a thread held for release, and an agent with none yet", () => {
    const { terminals } = demo().state.getSnapshot()
    const states = new Set(
      Object.values(terminals).flatMap((mail) =>
        mail.threads.flatMap((thread) => thread.messages.map((message) => message.state)),
      ),
    )
    expect([...states].toSorted()).toEqual(["delivered", "gone", "held", "leased", "queued"])
    expect(terminals[at("01")]?.threads.find((thread) => thread.peer === "t3")?.held).toBe(true)
    expect(terminals[at("01", elsewhere)]).toEqual({ handle: "t1", agent: true, threads: [] })
  })

  it("hold what waits while paused, and let it wait again once resumed", () => {
    const messages = demo()
    const badge = () => {
      const { terminals, paused } = messages.state.getSnapshot()
      return mailBadge(terminals[at("04")], paused)
    }
    expect(badge()).toEqual({ count: 2, kind: "waiting" })
    messages.pause(true)
    expect(badge()).toEqual({ count: 2, kind: "paused" })
    messages.pause(false)
    expect(badge()).toEqual({ count: 2, kind: "waiting" })
  })

  it("let a released thread go on, for both its terminals", () => {
    const messages = demo()
    messages.release({ ...storefront, terminalId: "01" }, "t-flaky")
    const { terminals } = messages.state.getSnapshot()
    for (const terminal of ["01", "03"]) {
      const thread = terminals[at(terminal)]?.threads.find((each) => each.id === "t-flaky")
      expect(thread).toMatchObject({ held: false, allowed: 25 })
      expect(thread?.messages.at(-1)?.state).toBe("queued")
    }
  })
})
