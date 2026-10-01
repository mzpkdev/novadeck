import type { AgentName } from "@novadeck/protocol"
import { afterEach, beforeEach, vi } from "vitest"

import type { Binding } from "../harnesses/bindings.js"
import type { HarnessEvent } from "../harnesses/events.js"
import { describe, expect, it } from "../test.js"
import { retentionMs, threadMs } from "./mailbox.js"
import { Messaging, type SendAnswer } from "./messaging.js"
import { memoryMailbox, type MailboxRecords } from "./records.js"

const binding = (agent: AgentName, sessionId: string, instance: string | null = "10"): Binding => ({
  agent,
  sessionId,
  instance,
})

const fact = (bound: Binding) => ({
  agent: bound.agent,
  sessionId: bound.sessionId,
  instance: bound.instance,
  startedAt: 1,
})

const started = (
  bound: Binding,
  cause: "prompt" | "harness" | "call" = "prompt",
): HarnessEvent => ({ type: "turn-started", ...fact(bound), cause })

const stopped = (bound: Binding, background = false): HarnessEvent => ({
  type: "turn-ended",
  ...fact(bound),
  outcome: "completed",
  background,
})

const observed = (bound: Binding, root = false): HarnessEvent => ({
  type: "session-observed",
  ...fact(bound),
  evidence: "conversation-observed",
  ...(root && { root }),
})

type Clock = { now: number }

const create = (records: MailboxRecords = memoryMailbox(), clock: Clock = { now: 1_000_000 }) => {
  const messaging = new Messaging({ records, now: () => clock.now, sweepMs: 0 })
  // Two running terminals in one project, each with its agent bound.
  const claude = binding("claude", "s-claude", "1")
  const codex = binding("codex", "s-codex", "2")
  messaging.register("A", "p", "claude")
  messaging.register("B", "p", "codex")
  messaging.observe("A", { binding: claude, events: [] })
  messaging.observe("B", { binding: codex, events: [] })
  // What a hook of the terminal's agent asks, with plenty of time left.
  const ask = (terminalId: string, bound: Binding, event: string, events: HarnessEvent[]) =>
    messaging.ask(terminalId, {
      agent: bound.agent,
      event,
      binding: bound,
      events,
      deadline: clock.now + 3_000,
    })
  const prompt = (terminalId: string, bound: Binding, cause?: "prompt" | "harness" | "call") =>
    ask(terminalId, bound, bound.agent === "agy" ? "PreInvocation" : "UserPromptSubmit", [
      started(bound, cause),
    ])
  const stop = (terminalId: string, bound: Binding, background = false) =>
    ask(terminalId, bound, "Stop", [stopped(bound, background)])
  const send = (from: string, to: string, text: string) => messaging.send(from, { to, text })
  return { messaging, records, clock, claude, codex, ask, prompt, stop, send }
}

const sent = (answer: SendAnswer) => {
  if (!answer.ok) throw new Error(answer.reason)
  return answer
}

const messages = (messaging: Messaging, terminalId: string) =>
  messaging.list(terminalId).threads.flatMap((thread) => thread.messages)

describe("handles", () => {
  it("are given once per terminal, kept across its shells, and never reused in a project", () => {
    const messaging = new Messaging({ sweepMs: 0 })
    expect(messaging.register("A", "p", "claude")).toBe("claude-1")
    expect(messaging.register("B", "p", "term")).toBe("term-1")
    expect(messaging.register("C", "p", "claude")).toBe("claude-2")
    expect(messaging.register("D", "q", "claude")).toBe("claude-1")
    messaging.unregister("A")
    expect(messaging.handle("A")).toBeUndefined()
    // Restarted or restored, it is the same terminal.
    expect(messaging.register("A", "p", "term")).toBe("claude-1")
    expect(messaging.register("E", "p", "claude")).toBe("claude-3")
  })
})

describe("sending", () => {
  it("addresses a terminal by handle or by its agent's name, never one without an agent", () => {
    const { messaging, send } = create()
    messaging.register("C", "p", "term")
    expect(sent(send("A", "codex", "hi"))).toMatchObject({ to: "codex-1", state: "queued" })
    expect(sent(send("A", "codex-1", "again"))).toMatchObject({ to: "codex-1" })
    expect(send("A", "term-1", "hi")).toEqual({
      ok: false,
      reason: "term-1 has no agent running there that NovaDeck can deliver to.",
    })
    // Terminals of other projects are not there to address.
    messaging.register("Z", "q", "agy")
    messaging.observe("Z", { binding: binding("agy", "s-agy"), events: [] })
    expect(send("A", "agy-1", "hi")).toMatchObject({ ok: false })
  })

  it("says where a message goes, never that it was delivered", () => {
    const { send, prompt, codex } = create()
    expect(sent(send("A", "codex", "one"))).toMatchObject({
      state: "queued",
      route: "when its agent first prompts",
    })
    prompt("B", codex)
    expect(sent(send("A", "codex", "two"))).toMatchObject({
      route: "at its turn's end or its next prompt",
    })
  })

  it("keeps the text as sent, without control characters, up to 4 KB", () => {
    const { messaging, send } = create()
    sent(send("A", "codex", "line\r\n\u001b[1mbold\ttab"))
    expect(messages(messaging, "A")[0]?.text).toBe("line\n[1mbold\ttab")
    expect(send("A", "codex", "é".repeat(2_049))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("longer than 4 KB"),
    })
    expect(sent(send("A", "codex", "é".repeat(2_048)))).toMatchObject({ state: "queued" })
    expect(send("A", "codex", " \n\u0007")).toEqual({ ok: false, reason: "The message is empty." })
    expect(messaging.send("A", { to: "codex" })).toMatchObject({ ok: false })
    expect(messaging.send("A", { to: "codex", text: "x", as: "the person" })).toMatchObject({
      ok: false,
    })
  })

  it("answers the same text to the same recipient within ten seconds as the same message", () => {
    const { send, clock } = create()
    const first = sent(send("A", "codex", "same"))
    clock.now += 10_000
    expect(sent(send("A", "codex", "same")).id).toBe(first.id)
    clock.now += 1
    expect(sent(send("A", "codex", "same")).id).not.toBe(first.id)
  })

  it("threads messages between the same two terminals within ten minutes, either way", () => {
    const { messaging, send, clock } = create()
    const first = sent(send("A", "codex", "one"))
    clock.now += threadMs
    sent(send("B", "claude", "two"))
    clock.now += threadMs + 1
    sent(send("A", "codex", "three"))
    const threads = messaging.list("A").threads
    expect(threads.map((thread) => thread.messages.map(({ text, hop }) => [text, hop]))).toEqual([
      [["three", 1]],
      [
        ["one", 1],
        ["two", 2],
      ],
    ])
    expect(threads[1]).toMatchObject({ peer: "codex-1", hops: 2, allowed: 12, held: false })
    expect(threads[1]?.messages[0]?.id).toBe(first.id)
  })

  it("limits a sender to 10 a minute, 3 of them to any one terminal", () => {
    const { messaging, send, clock } = create()
    for (const id of ["C", "D", "E", "F"]) {
      messaging.register(id, "p", "term")
      messaging.observe(id, { binding: binding("codex", `s-${id}`, id), events: [] })
    }
    for (let index = 0; index < 3; index += 1) sent(send("A", "codex-1", `to B ${index}`))
    expect(send("A", "codex-1", "fourth")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("3 of them to any one terminal"),
    })
    for (const to of ["term-1", "term-2"])
      for (let index = 0; index < 3; index += 1) sent(send("A", to, `to ${to} ${index}`))
    sent(send("A", "term-3", "tenth"))
    expect(send("A", "term-4", "eleventh")).toMatchObject({ ok: false })
    clock.now += 60_000
    expect(sent(send("A", "term-4", "a minute on"))).toMatchObject({ state: "queued" })
  })

  it("limits every agent together to 60 a minute", () => {
    const { messaging, send } = create()
    const recipients = ["R1", "R2", "R3"].map((id) => {
      messaging.register(id, "p", "term")
      messaging.observe(id, { binding: binding("codex", `s-${id}`, id), events: [] })
      return messaging.handle(id)!
    })
    const senders = Array.from({ length: 7 }, (_, index) => {
      const id = `S${index}`
      messaging.register(id, "p", "term")
      return id
    })
    const answers = senders.flatMap((from) =>
      recipients.flatMap((to) => [0, 1, 2].map((index) => send(from, to, `${from} ${index}`))),
    )
    expect(answers.filter((answer) => answer.ok)).toHaveLength(60)
    expect(answers.at(-1)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("as many messages as they may this minute"),
    })
  })

  it("refuses more once a recipient has 50 waiting", () => {
    const { messaging, send, clock } = create()
    for (let index = 0; index < 50; index += 1) {
      if (index % 3 === 0) clock.now += 60_000
      sent(send("A", "codex", `message ${index}`))
    }
    clock.now += 60_000
    expect(send("A", "codex", "one more")).toMatchObject({
      ok: false,
      reason:
        "codex-1 already has 50 messages waiting; wait for it to take them before sending more.",
    })
    expect(messages(messaging, "B")).toHaveLength(50)
  })
})

describe("guards", () => {
  it("hold a thread's 13th message until the person releases it, then allow 12 more", () => {
    const { messaging, send, clock } = create()
    const answers = Array.from({ length: 14 }, (_, index) => {
      clock.now += 30_000
      return sent(
        index % 2 === 0 ? send("A", "codex", `${index}`) : send("B", "claude", `${index}`),
      )
    })
    expect(answers.slice(0, 12).every(({ state }) => state === "queued")).toBe(true)
    expect(answers.slice(12)).toMatchObject([
      { state: "held", held: "release" },
      { state: "held", held: "release" },
    ])
    const [thread] = messaging.list("A").threads
    expect(thread).toMatchObject({ hops: 14, allowed: 12, held: true })
    messaging.release(thread!.id)
    expect(messaging.list("A").threads[0]).toMatchObject({ allowed: 26, held: false })
    expect(messages(messaging, "A").every(({ state }) => state === "queued")).toBe(true)
    expect(() => messaging.release("t-unknown")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    )
  })

  it("hold every message while paused, across restarts, and deliver in order once resumed", () => {
    const records = memoryMailbox()
    const first = create(records)
    sent(first.send("A", "codex", "before"))
    first.messaging.pause(true)
    expect(sent(first.send("A", "codex", "during"))).toMatchObject({
      state: "held",
      held: "paused",
    })
    expect(messages(first.messaging, "A").map(({ state }) => state)).toEqual(["held", "held"])
    first.messaging.close()
    const second = create(records)
    expect(second.messaging.isPaused()).toBe(true)
    expect(second.prompt("B", second.codex)).toEqual({ leaseId: null, stdout: "" })
    second.messaging.pause(false)
    expect(records.messagingPaused()).toBe(false)
    const answer = second.prompt("B", second.codex)
    expect(answer.stdout).toMatch(/before[\s\S]*during/)
  })
})

describe("delivery through hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("leases waiting messages at the recipient's prompt, delivered once acknowledged", () => {
    const { messaging, send, prompt, codex } = create()
    const { id } = sent(send("A", "codex", "Review a.ts"))
    const answer = prompt("B", codex)
    expect(answer.leaseId).toEqual(expect.any(String))
    const { hookSpecificOutput } = JSON.parse(answer.stdout!) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    expect(hookSpecificOutput.hookEventName).toBe("UserPromptSubmit")
    expect(hookSpecificOutput.additionalContext).toContain(
      `<message id="${id}" from="claude-1" agent="Claude Code"`,
    )
    expect(hookSpecificOutput.additionalContext).toContain(">Review a.ts</message>")
    expect(messages(messaging, "B")[0]).toMatchObject({ state: "leased" })
    messaging.acknowledge("B", answer.leaseId!)
    expect(messages(messaging, "B")[0]).toMatchObject({
      state: "delivered",
      deliveredAt: 1_000_000,
    })
    // Nothing more waits.
    expect(prompt("B", codex)).toEqual({ leaseId: null, stdout: "" })
  })

  it("continues a working agent's Stop with its messages, at most twice a turn", () => {
    const { messaging, send, prompt, stop, codex, clock } = create()
    prompt("B", codex)
    const stops = [1, 2, 3].map((index) => {
      clock.now += 60_000
      sent(send("A", "codex", `message ${index}`))
      const answer = stop("B", codex)
      if (answer.leaseId) messaging.acknowledge("B", answer.leaseId)
      return answer
    })
    expect(JSON.parse(stops[0]!.stdout!)).toMatchObject({
      decision: "block",
      reason: expect.stringContaining("message 1"),
    })
    expect(JSON.parse(stops[1]!.stdout!).reason).toContain("message 2")
    // The third Stop ends the turn; its message waits for the next prompt.
    expect(stops[2]).toEqual({ leaseId: null, stdout: "" })
    expect(messaging.delivery("B")?.state).toBe("settled")
    expect(JSON.parse(prompt("B", codex).stdout!).hookSpecificOutput.additionalContext).toContain(
      "message 3",
    )
  })

  it("leaves a Stop to end when the person queued a prompt, which delivers instead", () => {
    const { messaging, send, prompt, stop, codex } = create()
    prompt("B", codex)
    messaging.input("B", { submits: true, answers: false })
    sent(send("A", "codex", "hello"))
    expect(stop("B", codex)).toEqual({ leaseId: null, stdout: "" })
    expect(messaging.delivery("B")?.state).toBe("busy")
    expect(prompt("B", codex).leaseId).toEqual(expect.any(String))
  })

  it("still continues a Stop after an answer to a request during the turn", () => {
    const { messaging, send, prompt, stop, codex } = create()
    prompt("B", codex)
    messaging.input("B", { submits: true, answers: true })
    sent(send("A", "codex", "hello"))
    expect(stop("B", codex).leaseId).toEqual(expect.any(String))
  })

  it("leases only with time left before the hook's deadline to print and acknowledge", () => {
    const { messaging, send, codex, clock } = create()
    sent(send("A", "codex", "hello"))
    const late = messaging.ask("B", {
      agent: "codex",
      event: "UserPromptSubmit",
      binding: codex,
      events: [started(codex)],
      deadline: clock.now + 299,
    })
    expect(late).toEqual({ leaseId: null, stdout: "" })
    expect(messages(messaging, "B")[0]?.state).toBe("queued")
  })

  it("returns a lapsed lease's messages to queued, its Stop taken as not continued", () => {
    const { messaging, send, prompt, stop, codex } = create()
    prompt("B", codex)
    sent(send("A", "codex", "hello"))
    const answer = stop("B", codex)
    expect(answer.leaseId).toEqual(expect.any(String))
    expect(messaging.delivery("B")?.state).toBe("working")
    vi.advanceTimersByTime(4_999)
    expect(messages(messaging, "B")[0]?.state).toBe("leased")
    vi.advanceTimersByTime(1)
    expect(messages(messaging, "B")[0]?.state).toBe("queued")
    expect(messaging.delivery("B")?.state).toBe("settled")
    // A late acknowledgement is ignored; the message arrives again, by id, later.
    messaging.acknowledge("B", answer.leaseId!)
    expect(messages(messaging, "B")[0]?.state).toBe("queued")
    expect(prompt("B", codex).leaseId).toEqual(expect.any(String))
  })

  it("ignores an acknowledgement for another terminal's lease", () => {
    const { messaging, send, prompt, codex } = create()
    sent(send("A", "codex", "hello"))
    const { leaseId } = prompt("B", codex)
    messaging.acknowledge("A", leaseId!)
    messaging.acknowledge("B", "not-a-lease-at-all-here")
    expect(messages(messaging, "B")[0]?.state).toBe("leased")
  })

  it("puts every lease held when the runner stops back to queued", () => {
    const records = memoryMailbox()
    const first = create(records)
    sent(first.send("A", "codex", "hello"))
    expect(first.prompt("B", first.codex).leaseId).toEqual(expect.any(String))
    first.messaging.close()
    const second = create(records)
    expect(messages(second.messaging, "B")[0]?.state).toBe("queued")
    // The resumed session takes it at its first prompt.
    expect(second.prompt("B", second.codex).stdout).toContain("hello")
  })

  it("delivers several messages together, up to 4 KB, the rest at the next hook", () => {
    const { messaging, send, prompt, codex } = create()
    sent(send("A", "codex", "a".repeat(3_000)))
    sent(send("A", "codex", "b".repeat(2_000)))
    const first = prompt("B", codex)
    messaging.acknowledge("B", first.leaseId!)
    expect(first.stdout).not.toContain("bbb")
    expect(prompt("B", codex).stdout).toContain("b".repeat(2_000))
  })

  it("gives nested agents' and other sessions' hooks nothing", () => {
    const { send, codex, messaging, clock } = create()
    sent(send("A", "codex", "hello"))
    // A codex exec inside Codex: another process, another session, while Codex stays bound.
    const nested = binding("codex", "s-nested", "99")
    for (const event of ["UserPromptSubmit", "Stop"])
      expect(
        messaging.ask("B", {
          agent: "codex",
          event,
          binding: codex,
          events: [event === "Stop" ? stopped(nested) : started(nested)],
          deadline: clock.now + 3_000,
        }),
      ).toEqual({ leaseId: null, stdout: "" })
    expect(messages(messaging, "B")[0]?.state).toBe("queued")
    expect(messaging.delivery("B")?.state).toBe("fresh")
  })

  it("keeps a Claude Code turn working while its background tasks run", () => {
    const { messaging, prompt, stop, claude } = create()
    prompt("A", claude)
    stop("A", claude, true)
    expect(messaging.delivery("A")?.state).toBe("working")
    prompt("A", claude, "harness")
    stop("A", claude)
    expect(messaging.delivery("A")?.state).toBe("settled")
  })
})

describe("gone messages", () => {
  it("are gone once the recipient's session ends, its sender told once, and wait again if it returns", () => {
    const { messaging, send, codex } = create()
    const { id } = sent(send("A", "codex", "hello"))
    messaging.observe("B", { binding: null, events: [] })
    expect(messages(messaging, "B")[0]?.state).toBe("gone")
    expect(send("A", "codex-1", "again")).toMatchObject({ ok: false })
    messaging.register("C", "p", "term")
    messaging.observe("C", { binding: binding("agy", "s-agy", "5"), events: [] })
    const told = sent(send("A", "agy", "first"))
    expect(told.gone).toEqual([{ id, to: "codex-1" }])
    expect(sent(send("A", "agy", "second")).gone).toBeUndefined()
    messaging.observe("B", { binding: codex, events: [] })
    expect(messages(messaging, "B")[0]?.state).toBe("queued")
  })

  it("are gone once the harness announces a new session there, as after /clear", () => {
    const { messaging, send } = create()
    sent(send("A", "codex", "hello"))
    messaging.observe("B", { binding: binding("codex", "s-cleared", "2"), events: [] })
    expect(messages(messaging, "B")[0]?.state).toBe("gone")
    expect(messaging.delivery("B")?.state).toBe("fresh")
  })
})

describe("Antigravity's root conversation", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const agyTerminal = () => {
    const setup = create()
    const root = binding("agy", "c-root", "7")
    setup.messaging.register("G", "p", "agy")
    return { ...setup, root }
  }

  const invocation = (bound: Binding, number: number): HarnessEvent[] => [
    observed(bound),
    started(bound, number === 0 ? "prompt" : "call"),
  ]

  it("is the conversation of the first model call after it binds, until its status line names one", () => {
    const { messaging, ask, send, root } = agyTerminal()
    const answer = (bound: Binding, number: number) => {
      messaging.observe("G", { binding: bound, events: [] })
      return ask("G", bound, "PreInvocation", invocation(bound, number))
    }
    expect(answer(root, 0)).toEqual({ leaseId: null, stdout: "{}\n" })
    sent(send("A", "agy", "hello"))
    // A subagent's calls are in its own conversation: they get nothing, and the binding
    // following them is no new session.
    const subagent = binding("agy", "c-sub", "7")
    expect(answer(subagent, 0)).toEqual({ leaseId: null, stdout: "{}\n" })
    expect(messages(messaging, "G")[0]?.state).toBe("queued")
    const first = answer(root, 0)
    expect(JSON.parse(first.stdout!)).toEqual({
      injectSteps: [{ ephemeralMessage: expect.stringContaining(">hello</message>") }],
    })
    messaging.acknowledge("G", first.leaseId!)
    // An injected message lasts one model call: each later call of the turn gets it again.
    const later = answer(root, 1)
    expect(later).toEqual({ leaseId: null, stdout: first.stdout })
    expect(answer(root, 2).stdout).toBe(first.stdout)
    // The next turn starts afresh.
    messaging.observe("G", { binding: root, events: [stopped(root)] })
    expect(answer(root, 1)).toEqual({ leaseId: null, stdout: "{}\n" })
  })

  it("is the conversation its status line names, which alone names a new one", () => {
    const { messaging, ask, send, root } = agyTerminal()
    const subagent = binding("agy", "c-sub", "7")
    // Bound by a subagent's call: a guess its status line corrects.
    messaging.observe("G", { binding: subagent, events: invocation(subagent, 0) })
    sent(send("A", "agy", "hello"))
    messaging.observe("G", { binding: root, events: [observed(root, true)], statusLine: true })
    const answer = ask("G", root, "PreInvocation", invocation(root, 0))
    expect(answer.stdout).toContain("hello")
    messaging.acknowledge("G", answer.leaseId!)
    sent(send("A", "agy", "later"))
    // A /clear: its status line names another conversation.
    const cleared = binding("agy", "c-new", "7")
    messaging.observe("G", {
      binding: cleared,
      events: [observed(cleared, true)],
      statusLine: true,
    })
    expect(messages(messaging, "G").map(({ state }) => state)).toEqual(["delivered", "gone"])
    expect(messaging.delivery("G")?.state).toBe("fresh")
  })

  it("continues a Stop with a lasting reason, and an idle status line with no Stop is no completion", () => {
    const { messaging, ask, send, root } = agyTerminal()
    messaging.observe("G", { binding: root, events: invocation(root, 0) })
    sent(send("A", "agy", "hello"))
    const answer = ask("G", root, "Stop", [observed(root), stopped(root)])
    expect(JSON.parse(answer.stdout!)).toEqual({
      decision: "continue",
      reason: expect.stringContaining("hello"),
    })
    messaging.observe("G", { binding: root, events: [started(root, "call")] })
    // Esc or a denial: idle, with no Stop.
    const idle: HarnessEvent = { type: "turn-idle", ...fact(root) }
    messaging.observe("G", { binding: root, events: [idle], statusLine: true })
    expect(messaging.delivery("G")?.state).toBe("unknown")
    // After a Stop, idle says nothing new.
    messaging.observe("G", { binding: root, events: invocation(root, 0) })
    ask("G", root, "Stop", [observed(root), stopped(root)])
    messaging.observe("G", { binding: root, events: [idle], statusLine: true })
    expect(messaging.delivery("G")?.state).toBe("settled")
  })

  it("stays working at a Stop while a subagent still runs", () => {
    const { messaging, ask, root } = agyTerminal()
    messaging.observe("G", { binding: root, events: invocation(root, 0) })
    ask("G", root, "Stop", [observed(root), stopped(root, true)])
    expect(messaging.delivery("G")?.state).toBe("working")
  })
})

describe("listing", () => {
  it("lists the other terminals with their agents, and the caller's messages yet to arrive", () => {
    const { messaging, send, prompt, codex } = create()
    messaging.register("C", "p", "term")
    prompt("B", codex)
    const { id } = sent(send("A", "codex", "hello"))
    expect(messaging.agents("A")).toEqual({
      ok: true,
      handle: "claude-1",
      agents: [
        { handle: "codex-1", agent: "codex", state: "busy" },
        { handle: "term-1", agent: null, state: null },
      ],
      messages: [{ id, to: "codex-1", state: "queued", sentAt: 1_000_000 }],
    })
    expect(messaging.agents("C")).toMatchObject({ handle: "term-1", unbound: true })
  })

  it("gives the runner API a terminal's threads, messages and states", () => {
    const { messaging, send } = create()
    sent(send("A", "codex", "hello"))
    expect(messaging.list("B")).toEqual({
      terminalId: "B",
      handle: "codex-1",
      delivery: "fresh",
      paused: false,
      threads: [
        {
          id: expect.stringMatching(/^t-/),
          peer: "claude-1",
          hops: 1,
          allowed: 12,
          held: false,
          messages: [
            {
              id: expect.stringMatching(/^m-/),
              thread: expect.stringMatching(/^t-/),
              hop: 1,
              from: "claude-1",
              fromAgent: "claude",
              to: "codex-1",
              toAgent: "codex",
              text: "hello",
              sentAt: 1_000_000,
              state: "queued",
              held: null,
              deliveredAt: null,
            },
          ],
        },
      ],
    })
    // An exited terminal's messages are there while its handle is kept.
    messaging.unregister("B")
    expect(messaging.list("B")).toMatchObject({ handle: "codex-1", delivery: "unbound" })
    expect(messaging.list("B").threads[0]?.messages[0]?.state).toBe("gone")
    expect(() => messaging.list("nowhere")).toThrow(
      expect.objectContaining({ code: "TERMINAL_NOT_FOUND" }),
    )
  })
})

describe("retention", () => {
  it("keeps messages while either terminal runs or is saved, and for a day after", () => {
    const saved = new Set<string>()
    const records = { ...memoryMailbox(), terminalSaved: (id: string) => saved.has(id) }
    const { messaging, send, clock } = create(records)
    sent(send("A", "codex", "hello"))
    saved.add("A")
    messaging.unregister("A")
    messaging.unregister("B")
    messaging.sweep()
    clock.now += retentionMs
    messaging.sweep()
    // A's saved record keeps them.
    expect(records.messages()).toHaveLength(1)
    saved.delete("A")
    messaging.sweep()
    clock.now += retentionMs - 1
    messaging.sweep()
    expect(records.messages()).toHaveLength(1)
    clock.now += 1
    messaging.sweep()
    expect(records.messages()).toEqual([])
    expect(records.threads()).toEqual([])
    expect(records.handles()).toEqual([])
  })
})
