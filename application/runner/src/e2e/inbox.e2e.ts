import { setups } from "./agents/index.js"
import { describe, e2e, expect, supported } from "./fixture.js"
import { asked, tool } from "./model/script.js"
import { delivered, own, result, start, through, turn } from "./scenarios.js"

// The same MCP tools and mail path for every supported harness. No harness-specific
// prompt, hook or command is needed for Inbox asks and answers.
for (const setup of setups) {
  describe.skipIf(!supported)(setup.name, () => {
    const it = e2e(setup)
    it("asks and tells through Inbox immediately, then receives the person's answer as mail", async ({
      e2e: run,
    }) => {
      run.model.use(
        own((call) => {
          if (delivered(call, "you")) return { text: "I received your Inbox answer: green." }
          if (asked(call, "Ask through Inbox")) {
            const name = tool(call, "ask")
            if (!name)
              throw new Error(
                "Novadeck's ask tool is missing; offered: " +
                  JSON.stringify(call.tools.filter((offered) => /novadeck|search/i.test(offered))),
              )
            return {
              calls: [
                {
                  name,
                  input: {
                    subject: "Which colour should the heading use?",
                    body: "I can keep working while you choose.",
                    hard_to_undo: "The public theme uses this colour.",
                    shape: {
                      type: "options",
                      options: [
                        {
                          label: "Blue",
                          summary: "Calm",
                          details: "Matches the existing palette.",
                          code: { path: "theme.css", text: "--heading: blue;" },
                        },
                        { label: "Green", summary: "Bright" },
                      ],
                      recommend: 0,
                    },
                  },
                },
              ],
            }
          }
          if (
            result(call)?.includes(" is in the user's Inbox. Their answer arrives later as mail")
          ) {
            const name = tool(call, "tell")
            if (!name)
              throw new Error(
                "Novadeck's tell tool is missing; offered: " +
                  JSON.stringify(call.tools.filter((offered) => /novadeck|search/i.test(offered))),
              )
            return {
              calls: [
                {
                  name,
                  input: {
                    subject: "Other work is ready",
                    body: "The tests pass while the colour waits.",
                  },
                },
              ],
            }
          }
          if (/Update [a-f0-9-]+ is in the user's Inbox/.test(result(call) ?? ""))
            return { text: "I continued without waiting for the answer." }
          return undefined
        }),
      )
      const terminal = await start(run, setup)
      // Reaching a final reply before answering proves ask did not wait synchronously.
      await turn(terminal, "Ask through Inbox", "I continued without waiting for the answer.")
      const letters = run.deck.terminals.inboxLetters()
      const ask = letters.find((each) => each.content.kind === "ask")!
      const told = letters.find((each) => each.content.kind === "tell")!
      expect(ask.terminalId).toBe(terminal.id)
      expect(told.terminalId).toBe(terminal.id)
      const before = terminal.messages().threads.filter((thread) => thread.peer === "you")
      expect(before).toHaveLength(2)
      expect(
        before
          .flatMap((thread) => thread.messages)
          .every((message) => message.state === "delivered"),
      ).toBe(true)
      run.deck.terminals.readTells([told.id])
      expect(run.deck.terminals.inboxLetters().map((each) => each.id)).toEqual([ask.id])
      const mark = terminal.mark()
      // This is the same runner operation that the authenticated UI's asks.answer calls.
      run.deck.terminals.answerAsk(ask.id, { type: "reply", option: 1, text: "Use green, please." })
      expect(() =>
        run.deck.terminals.answerAsk(ask.id, { type: "reply", option: null, text: "Again" }),
      ).toThrow(/no longer/)
      expect(run.deck.terminals.inboxLetters()).toEqual([])
      await terminal.until("I received your Inbox answer: green.")
      await through(terminal, ["settled"], { after: mark })
      const received = await run.model.waitFor((call) => !call.side && delivered(call, "you"))
      const text = [received.system, ...received.turns.map((entry) => entry.text)].join("\n")
      expect(text).toMatch(/person=['"][A-Za-z0-9]{8}['"]/)
      expect(text).toContain("Novadeck relayed the user's response")
      expect(text).toContain("Use green, please.")
      const history = terminal.messages().threads.flatMap((thread) => thread.messages)
      expect(history.filter((message) => message.inbox === "answer")).toMatchObject([
        {
          from: "you",
          to: terminal.handle,
          state: "delivered",
          text: "Green\n\nUse green, please.",
        },
      ])
      expect(history.find((message) => message.inbox === "ask")?.text).toContain(
        "theme.css\n--heading: blue;",
      )
      expect(history.some((message) => message.inbox === "tell")).toBe(true)
    })
  })
}
