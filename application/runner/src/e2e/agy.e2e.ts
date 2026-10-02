import { agy } from "./agents/agy.js"
import type { DeckTerminal } from "./deck.js"
import { describe, e2e, expect, type E2E } from "./fixture.js"
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

// A turn's end as NovaDeck sees it: Settled, or Unknown when it misread Antigravity's
// status line at the turn's end (see the known gap below).
const ended = ["settled", "unknown"] as const

describe("Antigravity", () => {
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
    run.model.use(
      sends("Ask t2 for its colour", "t2", "What is your colour?"),
      // Once sent, t1 starts a sleep in the background, so its turn stays open until the
      // sleep ends and the answer comes with its Stop: a turn that ended could be left
      // Unknown and never rung (see the known gap below).
      own((call) => {
        const last = call.turns.at(-1)
        if (last?.role !== "tool" || !last.text.includes("to t2 is queued")) return undefined
        const command = {
          CommandLine: "sleep 15",
          Cwd: run.sandbox.project,
          WaitMsBeforeAsync: 500,
          toolSummary: "Pause",
          toolAction: "Pausing",
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
    // Its answer comes back to t1, whose Stop continues the turn with it.
    const answered = await run.model.waitFor(delivered("t2"), 60_000)
    expect(latest(answered)).toContain("Mine is teal.")

    expect(messages(t1).map((one) => [one.from, one.to, one.state])).toEqual([
      ["t1", "t2", "delivered"],
      ["t2", "t1", "delivered"],
    ])
    expect(messages(t2)).toEqual(messages(t1))
    await t1.until("t2 says teal.")
  })

  // A known gap, kept here so it can't go unnoticed: Antigravity's status line still says
  // working for a moment after its Stop hook starts, so NovaDeck often (about two turns
  // in five against the fake model) takes the turn as resumed, and the idle line after as
  // a turn that ended without a Stop: the terminal is left Unknown, and messages for it
  // are never rung. Ten turns all Settled is then unlikely enough to fail every run. Once
  // NovaDeck reads that line right, this passes: drop `fails`, have the scenarios above
  // wait for Settled alone, and let t1 above end its turn without its sleep.
  it.fails("settles after every turn", async ({ e2e: run }) => {
    run.model.use(
      own((call) => {
        const turn = /Turn (\d+)/.exec(latest(call))?.[1]
        return turn ? { text: `Done ${turn}.` } : undefined
      }),
    )
    const t1 = await start(run)

    const states: string[] = []
    for (let turn = 1; turn <= 10; turn++) {
      // eslint-disable-next-line no-await-in-loop -- One turn after another, as typed.
      await t1.submit(`Turn ${turn}`)
      // eslint-disable-next-line no-await-in-loop -- As above.
      await t1.until(`Done ${turn}.`)
      // eslint-disable-next-line no-await-in-loop -- As above.
      await t1.delivery(ended)
      // The misread comes within a status line's refresh after the turn ends.
      // eslint-disable-next-line no-await-in-loop -- As above.
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      states.push(t1.messages().delivery)
    }
    expect(states).toEqual(Array.from({ length: 10 }, () => "settled"))
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
