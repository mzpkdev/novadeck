import { agy } from "./agents/agy.js"
import { claude } from "./agents/claude.js"
import { codex } from "./agents/codex.js"
import { describe, e2e, expect, supported } from "./fixture.js"
import { ringsAfterTurn, ringsAtReady } from "./known-gaps.js"
import { gate, latest, tool } from "./model/script.js"
import {
  deliveries,
  delivered,
  ended,
  holds,
  messages,
  own,
  replies,
  ring,
  sends,
  sent,
  start,
  startupScreens,
  through,
  turn,
} from "./scenarios.js"

// The same scenarios for every harness. Where one differs, it is a trait of its setup or
// a known gap (known-gaps.ts), never a check of which harness this is.
for (const setup of [claude, codex, agy]) {
  describe.skipIf(!supported)(setup.name, () => {
    const it = e2e(setup)

    it("starts straight at its prompt, which NovaDeck sees as Ready", async ({ e2e: run }) => {
      const t1 = await start(run, setup)

      const screen = await t1.until(setup.banner)
      // Nothing stands between it and its prompt: no trust, sign-in, key or update screen.
      expect(screen).not.toMatch(startupScreens)
      // A harness that starts its session as it starts binds at Ready; the others bind at
      // their first prompt.
      expect(t1.summary().agent).toBe(setup.bindsAtReady ? setup.agent : null)
    })

    it("takes a prompt to the model and shows its reply, then ends its turn", async ({
      e2e: run,
    }) => {
      run.model.use(replies("Say the word", "Pelican-7 says hello."))
      const t1 = await start(run, setup)

      await turn(t1, setup, "Say the word", "Pelican-7 says hello.")

      const call = await run.model.waitFor(
        (one) => !one.side && latest(one).includes("Say the word"),
      )
      expect(call.api).toBe(setup.dialect.api)
      expect(tool(call, "send")).toBeDefined()
      // By its first prompt, every harness has bound its session.
      expect(t1.summary().agent).toBe(setup.agent)
    })

    it("rings an idle agent for a message, and its answer reaches the sender", async ({
      e2e: run,
    }) => {
      // Where a turn's end may not be rung, t1 holds its turn open after sending until t2
      // has answered, so the answer comes as its Stop continuation instead.
      const hold = gate()
      if (ringsAfterTurn(setup)) hold.open()
      run.model.use(
        sends("Ask t2 for its colour", "t2", "What is your colour?"),
        own(async (call) => {
          if (!sent(call, "t2")) return undefined
          await hold.opened
          return { text: "Asked." }
        }),
        own((call) =>
          delivered(call, "t1")
            ? sends("What is your colour?", "t1", "Mine is teal.")(call)
            : undefined,
        ),
        own((call) => (delivered(call, "t2") ? { text: "t2 says teal." } : undefined)),
        replies("Keep this in mind", "Kept."),
      )
      const t1 = await start(run, setup)
      const t2 = await start(run, setup)
      // Where Ready can't be rung, t2 takes a turn first, so it is rung once that has ended.
      if (!ringsAtReady(setup)) await turn(t2, setup, "Keep this in mind", "Kept.")
      const calls = run.model.mark()
      const [from1, from2] = [t1.mark(), t2.mark()]

      await t1.submit("Ask t2 for its colour")

      // t2, idle, is rung: its prompt is the doorbell's line, and its hook adds the message
      // from t1 beside it.
      const rung = await run.model.waitFor((call) => delivered(call, "t1"), { after: calls })
      expect(latest(rung)).toMatch(ring)
      expect(deliveries(rung)).toEqual([{ from: "t1", text: "What is your colour?" }])
      await through(t2, ["ringing", "working"], { after: from2 })
      await through(t2, [holds("t1", "t2", "queued"), holds("t1", "t2", "delivered")], {
        after: from2,
      })
      // Once t2's answer waits for t1, a held t1 may end its turn, and its Stop takes it.
      await t1.reached(holds("t2", "t1", "queued"), { after: from1 })
      hold.open()
      // The answer comes back to t1, however t1 was waiting for it, and its turn ends.
      const answer = await run.model.waitFor((call) => delivered(call, "t2"), { after: calls })
      expect(deliveries(answer)).toEqual([{ from: "t2", text: "Mine is teal." }])
      await t1.until("t2 says teal.")
      await through(t1, [holds("t2", "t1", "delivered"), ended(setup)], { after: from1 })

      expect(messages(t1).map((one) => [one.from, one.to, one.state])).toEqual([
        ["t1", "t2", "delivered"],
        ["t2", "t1", "delivered"],
      ])
      expect(messages(t2)).toEqual(messages(t1))
    })

    it("reaches no model or login but the fake one", async ({ e2e: run }) => {
      run.model.use(own(() => ({ text: "Nothing left the machine." })))
      const t1 = await start(run, setup)

      await turn(t1, setup, "Is this hermetic", "Nothing left the machine.")

      expect(run.model.foreign).toBe(0)
      expect(run.model.errors).toEqual([])
      // Every request to the fake model was one a dialect answered. The only others are
      // tunnels the proxy refused, to hosts the harness is known to try with no setting
      // that turns them off.
      const unexpected = run.model.strays.filter((stray) => {
        const [method, host = ""] = stray.split(" ")
        return method !== "CONNECT" || !setup.refused.includes(host)
      })
      expect(unexpected).toEqual([])
    })
  })
}
