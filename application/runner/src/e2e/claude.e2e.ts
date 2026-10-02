import { setTimeout as sleep } from "node:timers/promises"

import { claude } from "./agents/claude.js"
import { describe, e2e, expect, supported } from "./fixture.js"
import { latest } from "./model/script.js"
import {
  deliveries,
  delivered,
  holds,
  messages,
  own,
  replies,
  ring,
  sends,
  sent,
  start,
  through,
  turn,
} from "./scenarios.js"

// What only Claude Code needs beyond the shared scenarios (messaging.e2e.ts).

const it = e2e(claude)

// How long a terminal is watched for a ring that mustn't come: past the doorbell's settle
// window (6 s from when a terminal shows Ready), so a ring had every chance to start.
const unrung = 8000

describe.skipIf(!supported)("Claude Code", () => {
  // A fork is `claude --resume <id> --fork-session`, a session of its own carrying its
  // parent's conversation. Messages wait for it only while none of its sessions has bound
  // in the terminal, which expects Claude Code as its command's program: here the person
  // picks the session to fork in Claude Code's picker, before which nothing binds. A
  // message for a session bound when it was sent is that session's alone, so the parent's
  // messages never go to its fork (docs/agent-messaging.md, "Messages").
  it("rings a forked session for the messages that waited for it, and its hook delivers", async ({
    e2e: run,
  }) => {
    run.model.use(
      replies("Remember the word heron", "Remembered."),
      replies("Say ready", "Ready here."),
      sends("Tell t3 hello", "t3", "Hello, fork."),
      own((call) => (sent(call, "t3") ? { text: "Told t3." } : undefined)),
      own((call) => (delivered(call, "t2") ? { text: "The fork says hello back." } : undefined)),
    )
    const t1 = await start(run, claude)
    await turn(t1, "Remember the word heron", "Remembered.")
    const parent = (await t1.detail()).sessionId
    expect(parent).not.toBeNull()
    const t2 = await start(run, claude)
    await turn(t2, "Say ready", "Ready here.")
    // The person forks a session in a new terminal, picking it in Claude Code's picker,
    // which lists the latest first.
    const t3 = await run.deck.open("claude --resume --fork-session")
    expect(t3.handle).toBe("t3")
    await t3.until(/❯ Say ready/, 60_000)
    const calls = run.model.mark()
    const mark = t3.mark()

    await t2.submit("Tell t3 hello")

    // The message waits for the first session of Claude Code to bind in t3, and nothing
    // rings the picker.
    await t2.until("Told t3.")
    await t3.reached(holds("t2", "t3", "queued"), { after: mark })
    await sleep(unrung)
    expect(t3.history().map((one) => one.delivery)).toEqual(t3.history().map(() => "unbound"))
    expect(messages(t3).map((one) => one.state)).toEqual(["queued"])

    // The person picks t1's session. Its fork's SessionStart binds a session of its own,
    // Ready; it is rung, and its hook delivers the message.
    await t3.confirm(/❯ Remember the word heron/, async () => t3.press("\x1b[B"))
    await through(t3, ["ready", "ringing", "working", holds("t2", "t3", "delivered")], {
      after: mark,
      timeoutMs: 60_000,
    })
    const rung = await run.model.waitFor((call) => delivered(call, "t2"), { after: calls })
    expect(latest(rung)).toMatch(ring)
    expect(deliveries(rung)).toEqual([{ from: "t2", text: "Hello, fork." }])
    // It is the fork: the parent's conversation, in a session of its own, while the
    // parent stays bound in t1.
    expect(
      rung.turns.some((one) => one.role === "user" && one.text.includes("Remember the word heron")),
    ).toBe(true)
    await t3.until("The fork says hello back.")
    await t3.reached("settled", { after: mark })
    const fork = (await t3.detail()).sessionId
    expect(fork).not.toBeNull()
    expect(fork).not.toBe(parent)
    expect((await t1.detail()).sessionId).toBe(parent)
  })
})
