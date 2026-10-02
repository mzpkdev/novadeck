import { codex } from "./agents/codex.js"
import type { DeckTerminal } from "./deck.js"
import { describe, e2e, expect, type E2E } from "./fixture.js"
import { latest, tool, type Call, type Rule } from "./model/script.js"

const it = e2e(codex)

// The screens Codex shows before its prompt when something isn't seeded.
const startupScreens = /Hooks need review|Update available|Sign in with ChatGPT|trust this folder/i

// Opens a terminal running Codex and waits until NovaDeck sees its prompt, by its title.
const start = async ({ deck }: E2E): Promise<DeckTerminal> => {
  const terminal = await deck.open("codex")
  await terminal.delivery(["ready"], 60_000)
  return terminal
}

// A rule for the agent's own turns, never a call Codex makes for itself, as its title.
const own =
  (rule: Rule): Rule =>
  (call) =>
    call.side ? undefined : rule(call)

// Whether the call's latest user turn holds a delivery of messages from `from`: as a
// prompt hook adds it, or escaped as a Stop hook's continuation carries it.
const delivered = (call: Call, from: string): boolean =>
  new RegExp(`(<|&lt;)novadeck-messages[\\s\\S]*from=("|&quot;)${from}("|&quot;)`).test(
    latest(call),
  )

// Whether the model's last call in this turn has had its output.
const answered = (call: Call): boolean => call.turns.at(-1)?.role === "tool"

describe("codex", () => {
  it("starts straight at its prompt, which NovaDeck sees as Ready", async ({ e2e: run }) => {
    const t1 = await start(run)
    const screen = await t1.screen()
    expect(screen).not.toMatch(startupScreens)
    expect(screen).toContain("OpenAI Codex")
    // Ready comes from its title alone: no session binds before its first prompt.
    expect(t1.summary().agent).toBeNull()
  })

  it("sends a typed prompt to the model and shows its reply", async ({ e2e: run }) => {
    run.model.use(
      own((call) =>
        latest(call).includes("hello from the e2e test")
          ? { text: "Hello back from the fake model." }
          : undefined,
      ),
    )
    const t1 = await start(run)
    await t1.submit("hello from the e2e test")
    const call = await run.model.waitFor(
      (one) => !one.side && latest(one).includes("hello from the e2e test"),
    )
    expect(call.api).toBe("responses")
    expect(tool(call, "send")).toBeDefined()
    await t1.until("Hello back from the fake model.")
    await t1.delivery(["settled"])
    // Its SessionStart, at the first prompt, bound the session.
    expect(t1.summary().agent).toBe("codex")
  })

  it("rings another Codex for a message the model sent, and back", async ({ e2e: run }) => {
    run.model.use(
      own((call) => {
        const send = tool(call, "send")
        if (!send) return undefined
        if (answered(call)) return { text: "Sent." }
        if (delivered(call, "t2")) return { text: "t2 says the code word is PAPAYA." }
        if (delivered(call, "t1"))
          return { calls: [{ name: send, input: { to: "t1", text: "The code word is PAPAYA." } }] }
        if (latest(call).includes("ask t2 for the code word"))
          return { calls: [{ name: send, input: { to: "t2", text: "What is the code word?" } }] }
        if (latest(call).includes("keep the code word")) return { text: "Kept." }
        return undefined
      }),
    )
    const t1 = await start(run)
    const t2 = await start(run)
    // A first turn, so t2 is Settled. Ready, its first screen's art vanishes as the
    // doorbell's line lands, which fails the ring (see the report on this suite).
    await t2.submit("keep the code word")
    await t2.until("Kept.")
    await t2.delivery(["settled"])
    await t1.submit("ask t2 for the code word")

    // The doorbell wakes t2, and its prompt hook adds the message.
    const asked = await run.model.waitFor((one) => !one.side && delivered(one, "t1"), 60_000)
    expect(latest(asked)).toContain("<novadeck-messages")
    expect(latest(asked)).toContain("What is the code word?")

    // t1 settled after sending: its doorbell brings t2's answer.
    const answer = await run.model.waitFor((one) => !one.side && delivered(one, "t2"), 60_000)
    expect(latest(answer)).toContain("The code word is PAPAYA.")
    await t1.until("t2 says the code word is PAPAYA.", 30_000)
    await t1.delivery(["settled"])
    const states = [t1, t2].flatMap((terminal) =>
      terminal.messages().threads.flatMap((thread) => thread.messages.map((one) => one.state)),
    )
    expect(states).toEqual(["delivered", "delivered", "delivered", "delivered"])
  })

  // A known gap, kept here so it can't go unnoticed: a Codex at its first screen, wide and
  // tall enough to draw its logo, erases the logo as anything lands in its input box, so
  // the doorbell's test paste changes rows far from its line and the ring fails. Once it
  // rings, this fails: drop `fails` and the first turn the test above gives t2.
  it.fails("rings a Codex still at its first screen", async ({ e2e: run }) => {
    run.model.use(
      own((call) => {
        const send = tool(call, "send")
        if (!send || answered(call)) return send ? { text: "Sent." } : undefined
        if (latest(call).includes("ask t2 for the code word"))
          return { calls: [{ name: send, input: { to: "t2", text: "What is the code word?" } }] }
        return undefined
      }),
    )
    const t1 = await start(run)
    const t2 = await start(run)
    await t1.submit("ask t2 for the code word")
    expect(await t2.delivery(["working", "unknown"], 60_000)).toBe("working")
  })

  it("reaches no model or login but the fake one", async ({ e2e: run }) => {
    run.model.use(own(() => ({ text: "Nothing left the machine." })))
    const t1 = await start(run)
    await t1.submit("is this hermetic")
    await t1.until("Nothing left the machine.")
    await t1.delivery(["settled"])
    expect(run.model.foreign).toBe(0)
    // Every request to the fake model was one the dialect answered; the only others are
    // tunnels the proxy refused, to GitHub for OpenAI's curated plugins and Codex's tips.
    const outside = run.model.strays.filter((stray) => !stray.startsWith("CONNECT "))
    expect(outside).toEqual([])
    const hosts = new Set(run.model.strays.map((stray) => stray.split(" ")[1]))
    for (const host of codex.hosts ?? []) expect(hosts).not.toContain(host)
    expect([...hosts].every((host) => /(^|\.)github(usercontent)?\.com$/.test(host ?? ""))).toBe(
      true,
    )
  })
})
