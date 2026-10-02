import { writeFile } from "node:fs/promises"
import { join } from "node:path"

import { agy, waiter } from "./agents/agy.js"
import type { DeckTerminal } from "./deck.js"
import { describe, e2e, expect, type E2E, supported } from "./fixture.js"
import { asked, latest, tool, type Call, type Rule } from "./model/script.js"

const it = e2e(agy)

// The doorbell's line, apart from its nonce (see docs/agent-messaging.md).
const doorbell = "[NovaDeck: automatic notice, agent messages waiting,"

// The screens Antigravity shows before its prompt when something isn't seeded.
const startupScreens =
  /trust this folder|sign in|Authentication required|color scheme|Update available/i

// Hosts the proxy refuses on every run: Antigravity's feature flags and its telemetry.
const background = new Set(["antigravity-unleash.goog", "play.googleapis.com"])

// Opens a terminal running Antigravity and waits until NovaDeck sees its prompt, by its
// status line.
const start = async ({ deck }: E2E): Promise<DeckTerminal> => {
  const terminal = await deck.open("agy")
  await terminal.delivery(["ready"], 60_000)
  return terminal
}

// A rule for the agent's own turns, never a call Antigravity makes for itself, as its
// conversation's title.
const own =
  (rule: Rule): Rule =>
  (call) =>
    call.side ? undefined : rule(call)

// Answers the agent's first look at a turn holding `text` by sending `message` to `to`.
const sends = (text: string, to: string, message: string): Rule =>
  own((call) => {
    const send = tool(call, "send")
    if (!send || !asked(call, text)) return undefined
    return { calls: [{ name: send, input: { to, text: message } }] }
  })

// Whether the call's latest user turn holds a delivery of messages from `from`: injected
// beside its prompt, or as a Stop hook's continuation carries it.
const delivered = (from: string) => (call: Call) =>
  !call.side &&
  latest(call).includes("<novadeck-messages") &&
  latest(call).includes(`from="${from}"`)

// Every message a terminal sent or received, oldest first within each thread.
const messages = (terminal: DeckTerminal) =>
  terminal.messages().threads.flatMap((thread) => thread.messages)

// A turn's end as NovaDeck sees it: Settled, or Unknown when its status line still says
// working just after the turn's Stop, as about two turns in five here. That known gap is
// pinned in messaging/messaging.test.ts (see docs/e2e-testing.md, "Known gaps"). Once
// fixed, wait for Settled alone, and let t1's turn in the round trip end without its wait.
const ended = ["settled", "unknown"] as const

describe.skipIf(!supported)("Antigravity", () => {
  it("starts straight at its prompt, which NovaDeck sees as Ready", async ({ e2e: run }) => {
    const t1 = await start(run)

    const screen = await t1.screen()
    expect(screen).not.toMatch(startupScreens)
    expect(screen).toContain("Antigravity CLI")
    // Ready comes from its status line alone: no conversation binds before its first prompt.
    expect(t1.summary().agent).toBeNull()
  })

  it("takes a prompt to the model and shows its reply, then ends its turn", async ({
    e2e: run,
  }) => {
    run.model.use(
      own((call) => (asked(call, "Say the word") ? { text: "Pelican-7 says hello." } : undefined)),
    )
    const t1 = await start(run)

    await t1.submit("Say the word")

    const call = await run.model.waitFor((one) => !one.side && latest(one).includes("Say the word"))
    expect(call.api).toBe("gemini")
    expect(tool(call, "send")).toBeDefined()
    await t1.until("Pelican-7 says hello.")
    // Once NovaDeck reads the turn's end right, this is Settled alone.
    await t1.delivery(ended)
    // Its first prompt started the conversation, which its hooks bound.
    expect(t1.summary().agent).toBe("agy")
  })

  it("rings an idle agent for a message, and its answer reaches the sender", async ({
    e2e: run,
  }) => {
    // t1 keeps its turn open until t2 has answered, so the answer comes with its Stop: a
    // turn that ended could be left Unknown and never rung (see `ended` above).
    const answered = join(run.sandbox.root, "answered")
    run.model.use(
      sends("Ask t2 for its colour", "t2", "What is your colour?"),
      // Once sent, t1 waits in the background for the file the test makes once t2 has
      // answered.
      own((call) => {
        const last = call.turns.at(-1)
        if (last?.role !== "tool" || !last.text.includes("to t2 is queued")) return undefined
        const command = {
          CommandLine: `${waiter(run.sandbox)} ${answered}`,
          Cwd: run.sandbox.project,
          WaitMsBeforeAsync: 500,
          toolSummary: "Wait",
          toolAction: "Waiting",
        }
        return { calls: [{ name: "run_command", input: command }] }
      }),
      (call) =>
        delivered("t1")(call) ? sends('from="t1"', "t1", "Mine is teal.")(call) : undefined,
      own((call) => (delivered("t2")(call) ? { text: "t2 says teal." } : undefined)),
    )
    const t1 = await start(run)
    const t2 = await start(run)

    await t1.submit("Ask t2 for its colour")

    // t2, idle at its prompt, is rung: its prompt is the doorbell's line, and its
    // PreInvocation hook injects the message beside it, from t1.
    const rung = await run.model.waitFor(delivered("t1"), 60_000)
    expect(latest(rung)).toContain(doorbell)
    expect(latest(rung)).toContain("What is your colour?")
    // Once t2's send has its answer, t1 may end its turn. That answer needn't be the
    // call's last turn: t2's hook injects t1's message into each of its model calls.
    await run.model.waitFor(
      (call) =>
        !call.side &&
        call.turns.some((turn) => turn.role === "tool" && turn.text.includes("to t1 is queued")),
      60_000,
    )
    await writeFile(answered, "")
    // Its answer comes back to t1, whose Stop continues the turn with it.
    const answer = await run.model.waitFor(delivered("t2"), 60_000)
    expect(latest(answer)).toContain("Mine is teal.")

    expect(messages(t1).map((one) => [one.from, one.to, one.state])).toEqual([
      ["t1", "t2", "delivered"],
      ["t2", "t1", "delivered"],
    ])
    expect(messages(t2)).toEqual(messages(t1))
    await t1.until("t2 says teal.")
  })

  it("reaches no model or login but the fake one", async ({ e2e: run }) => {
    run.model.use(own(() => ({ text: "Nothing left the machine." })))
    const t1 = await start(run)

    await t1.submit("Is this hermetic")
    await t1.until("Nothing left the machine.")
    await t1.delivery(ended)

    expect(run.model.foreign).toBe(0)
    // Every request to the fake model was one the dialect answered; the only others are
    // tunnels the proxy refused, to Antigravity's feature flags and telemetry.
    const outside = run.model.strays.filter((stray) => !stray.startsWith("CONNECT "))
    expect(outside).toEqual([])
    const hosts = new Set(run.model.strays.map((stray) => stray.split(" ")[1] ?? ""))
    for (const host of agy.hosts ?? []) expect(hosts).not.toContain(host)
    expect([...hosts].filter((host) => !background.has(host))).toEqual([])
  })
})
