import { setTimeout as sleep } from "node:timers/promises"

import { setups } from "./agents/index.js"
import { describe, e2e, expect, supported } from "./fixture.js"
import { asked, gate, latest } from "./model/script.js"
import { own, replies, start, through } from "./scenarios.js"

// The chat's Stop, `agents.interrupt`, never leaves the agent's TUI in a state the chat
// can't recover from: it presses Escape once, only while a turn works, so no second Escape
// opens a rewind picker over an empty box (docs/backend-api.md).

for (const setup of setups) {
  describe.skipIf(!supported)(setup.name, () => {
    const it = e2e(setup)

    it("presses one Escape for a double Stop, leaving an empty prompt with no picker, and takes the next prompt", async ({
      e2e: run,
    }) => {
      const held = gate()
      run.model.use(
        replies("Carry on", "Carried on."),
        own(async (call) => {
          if (!asked(call, "Take your time")) return undefined
          await held.opened
          return { text: "Too late." }
        }),
      )
      const t1 = await start(run, setup)
      const calls = run.model.mark()
      const mark = t1.mark()

      await t1.prompt("Take your time")
      await run.model.waitFor((call) => !call.side && latest(call).includes("Take your time"), {
        after: calls,
      })
      await t1.reached("working", { after: mark })
      await Promise.all([t1.interrupt(), t1.interrupt()])
      await t1.reached("unknown", { after: mark })
      held.open()
      // Past the time a second Escape of Esc-Esc's would have taken to open the picker.
      await sleep(2500)
      const shown = await t1.screen()
      if (setup.rewind) expect(shown).not.toMatch(setup.rewind.shows)
      expect(shown).not.toContain("Too late.")

      // Nothing is left in the box: the next prompt goes alone, as a normal turn.
      const next = t1.mark()
      await t1.prompt("Carry on")
      await t1.until("Carried on.")
      await through(t1, ["working", "settled"], { after: next })
      expect(await t1.screen()).not.toMatch(setup.rewind?.shows ?? /(?!)/)
    })

    it("sends nothing for a Stop while idle, however often, so no picker opens", async ({
      e2e: run,
    }) => {
      run.model.use(replies("Carry on", "Carried on."))
      const t1 = await start(run, setup)

      await Promise.all([t1.interrupt(), t1.interrupt(), t1.interrupt()])
      await t1.interrupt()
      await sleep(1500)
      if (setup.rewind) expect(await t1.screen()).not.toMatch(setup.rewind.shows)

      const mark = t1.mark()
      await t1.prompt("Carry on")
      await t1.until("Carried on.")
      await through(t1, ["working", "settled"], { after: mark })
    })
  })
}
