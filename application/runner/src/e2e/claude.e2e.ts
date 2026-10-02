import { claude } from "./agents/claude.js"
import type { DeckTerminal } from "./deck.js"
import { describe, e2e, expect } from "./fixture.js"
import { asked, latest, tool, type Call, type Rule } from "./model/script.js"

const it = e2e(claude)

// The doorbell's line, apart from its nonce (see docs/agent-messaging.md).
const doorbell = "[NovaDeck: automatic notice, agent messages waiting,"

// Answers the agent's first look at a turn holding `text` by sending `message` to `to`.
// The calls after the tool answered get the fallback, which ends the turn.
const sends =
  (text: string, to: string, message: string): Rule =>
  (call) => {
    const send = tool(call, "send")
    if (call.side || !send || !asked(call, text)) return undefined
    return { calls: [{ name: send, input: { to, text: message } }] }
  }

// A delivery of messages from `from`, as the hooks wrap them.
const delivered = (from: string) => (call: Call) =>
  !call.side &&
  latest(call).includes("<novadeck-messages") &&
  latest(call).includes(`from="${from}"`)

// Every message a terminal sent or received, oldest first within each thread.
const messages = (terminal: DeckTerminal) =>
  terminal.messages().threads.flatMap((thread) => thread.messages)

describe("Claude Code", () => {
  it("starts at its own prompt, which NovaDeck sees as Ready", async ({ e2e: { deck } }) => {
    const t1 = await deck.open("claude")

    await t1.delivery(["ready"], 60_000)
    const screen = await t1.until("❯")

    expect(t1.summary().agent).toBe("claude")
    expect(t1.summary().activity?.state).toBe("idle")
    // Nothing stands between it and its prompt: no trust, theme, key or login screen.
    expect(screen).not.toMatch(/trust|theme|API key|log ?in/i)
  })

  it("takes a prompt to the model and shows its reply, then settles", async ({
    e2e: { deck, model },
  }) => {
    model.use((call) =>
      asked(call, "Say the word") ? { text: "Pelican-7 says hello." } : undefined,
    )
    const t1 = await deck.open("claude")
    await t1.delivery(["ready"], 60_000)

    await t1.submit("Say the word")

    const call = await model.waitFor((one) => !one.side && latest(one).includes("Say the word"))
    expect(tool(call, "send")).toBeDefined()
    await t1.until("Pelican-7 says hello.")
    await t1.delivery(["settled"])
  })

  it("rings an idle agent for a message, and its answer reaches the sender", async ({
    e2e: { deck, model },
  }) => {
    model.use(
      sends("Ask t2 for its colour", "t2", "What is your colour?"),
      (call) =>
        delivered("t1")(call) ? sends('from="t1"', "t1", "Mine is teal.")(call) : undefined,
      (call) => (delivered("t2")(call) ? { text: "t2 says teal." } : undefined),
    )
    const t1 = await deck.open("claude")
    const t2 = await deck.open("claude")
    await t1.delivery(["ready"], 60_000)
    await t2.delivery(["ready"], 60_000)

    await t1.submit("Ask t2 for its colour")

    // t2, idle at its prompt, is rung: its prompt is the doorbell's line, and the message
    // comes beside it, from t1.
    const rung = await model.waitFor(delivered("t1"), 60_000)
    expect(latest(rung)).toContain(doorbell)
    expect(latest(rung)).toContain("What is your colour?")
    // Its answer comes back to t1, however t1 was waiting for it.
    const answered = await model.waitFor(delivered("t2"), 60_000)
    expect(latest(answered)).toContain("Mine is teal.")

    expect(messages(t1).map((one) => [one.from, one.to, one.state])).toEqual([
      ["t1", "t2", "delivered"],
      ["t2", "t1", "delivered"],
    ])
    await t1.until("t2 says teal.")
  })

  it("never reaches past the fake model", async ({ e2e: { deck, model } }) => {
    const t1 = await deck.open("claude")
    await t1.delivery(["ready"], 60_000)
    await t1.submit("Hello")
    await model.waitFor((one) => !one.side && latest(one).includes("Hello"))
    await t1.delivery(["settled"])

    expect(model.foreign).toBe(0)
    expect(model.strays.filter((stray) => /anthropic\.com|claude\.ai/.test(stray))).toEqual([])
  })
})
