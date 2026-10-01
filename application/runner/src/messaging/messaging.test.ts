import type { AgentName } from "@novadeck/protocol"
import { afterEach, beforeEach, vi } from "vitest"

import type { Binding } from "../harnesses/bindings.js"
import type { HarnessEvent } from "../harnesses/events.js"
import { describe, expect, it } from "../test.js"
import { retentionMs, threadMs } from "./mailbox.js"
import { Messaging, type SendAnswer, type Whereabouts } from "./messaging.js"
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

// One project and NovaDeck session, and another project.
const here = { projectId: "p", sessionId: "s" }
const elsewhere = { projectId: "q", sessionId: "s2" }

const create = (records: MailboxRecords = memoryMailbox(), clock: Clock = { now: 1_000_000 }) => {
  const messaging = new Messaging({ records, now: () => clock.now, sweepMs: 0, restoreMs: 0 })
  // Two running terminals in one project, each with its agent bound.
  const claude = binding("claude", "s-claude", "1")
  const codex = binding("codex", "s-codex", "2")
  messaging.register("A", here, "claude")
  messaging.register("B", here, "codex")
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

/** The terminals `agents` describes to A, as B's whereabouts say. */
const peersOf = (messaging: Messaging) => {
  const answer = messaging.agents("A", (terminalId) =>
    terminalId === "B"
      ? {
          title: "API author",
          folder: "src/api",
          branch: "feat/paging",
          plan: "Pagination",
          place: (path: string) => path.replace(/^\/w\//, ""),
        }
      : undefined,
  )
  if (!answer.ok) throw new Error(answer.reason)
  return answer.agents
}

const sent = (answer: SendAnswer) => {
  if (!answer.ok) throw new Error(answer.reason)
  return answer
}

const messages = (messaging: Messaging, terminalId: string) =>
  messaging.list(terminalId).threads.flatMap((thread) => thread.messages)

describe("handles", () => {
  it("are given once per terminal, kept across its shells, and never reused in a project", () => {
    const messaging = new Messaging({ sweepMs: 0, restoreMs: 0 })
    expect(messaging.register("A", here, "claude")).toBe("claude-1")
    expect(messaging.register("B", here, "term")).toBe("term-1")
    expect(messaging.register("C", here, "claude")).toBe("claude-2")
    expect(messaging.register("D", elsewhere, "claude")).toBe("claude-1")
    messaging.unregister("A")
    expect(messaging.handle("A")).toBeUndefined()
    // Restarted or restored, it is the same terminal.
    expect(messaging.register("A", here, "term")).toBe("claude-1")
    expect(messaging.register("E", here, "claude")).toBe("claude-3")
  })
})

describe("sending", () => {
  it("addresses a terminal by handle or by its agent's name, never one without an agent", () => {
    const { messaging, send } = create()
    messaging.register("C", here, "term")
    expect(sent(send("A", "codex", "hi"))).toMatchObject({ to: "codex-1", state: "queued" })
    expect(sent(send("A", "codex-1", "again"))).toMatchObject({ to: "codex-1" })
    expect(send("A", "term-1", "hi")).toEqual({
      ok: false,
      reason: "term-1 has no agent running there that NovaDeck can deliver to.",
    })
    // Terminals of other projects are not there to address.
    messaging.register("Z", elsewhere, "agy")
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
      reason: expect.stringContaining("4098 bytes, over the 4096 a message may hold"),
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
      messaging.register(id, here, "term")
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
      messaging.register(id, here, "term")
      messaging.observe(id, { binding: binding("codex", `s-${id}`, id), events: [] })
      return messaging.handle(id)!
    })
    const senders = Array.from({ length: 7 }, (_, index) => {
      const id = `S${index}`
      messaging.register(id, here, "term")
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

  it("delivers several messages together, up to 8 KB as printed, the rest at the next hook", () => {
    const { messaging, send, prompt, codex } = create()
    sent(send("A", "codex", "a".repeat(4_000)))
    sent(send("A", "codex", "b".repeat(4_000)))
    const first = prompt("B", codex)
    messaging.acknowledge("B", first.leaseId!)
    expect(first.stdout).not.toContain("bbb")
    expect(prompt("B", codex).stdout).toContain("b".repeat(4_000))
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

describe("critic's cases", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("delivers at a Stop after background work, once the person prompts again", () => {
    const { messaging, send, prompt, stop, claude } = create()
    prompt("A", claude)
    // The turn ends with a background task still running: Working, no root turn.
    stop("A", claude, true)
    expect(messaging.delivery("A")).toMatchObject({ state: "working", running: false })
    // The person's Enter starts their next prompt at once: nothing is queued.
    messaging.input("A", { submits: true, answers: false })
    prompt("A", claude)
    sent(send("B", "claude", "Review it"))
    expect(stop("A", claude).leaseId).toEqual(expect.any(String))
  })

  it("leaves a turn that began since alone when an older Stop's lease lapses", () => {
    const { messaging, send, prompt, stop, codex } = create()
    prompt("B", codex)
    sent(send("A", "codex", "one"))
    expect(stop("B", codex).leaseId).toEqual(expect.any(String))
    // Its acknowledgement was lost, but the harness continued, and the person prompted.
    prompt("B", codex)
    vi.advanceTimersByTime(5_000)
    expect(messaging.delivery("B")).toMatchObject({ state: "working", running: true })
  })

  it("refuses a message too large to deliver, saying how large it may be", () => {
    const { send } = create()
    expect(send("A", "codex", "&".repeat(4_000))).toEqual({
      ok: false,
      reason: expect.stringMatching(
        /^Delivered, this message would take \d+ bytes, over the 8192 a delivery may/,
      ),
    })
    expect(sent(send("A", "codex", "a".repeat(4_096)))).toMatchObject({ state: "queued" })
  })

  it("never makes the root's messages gone when Antigravity restarts during a subagent's work", () => {
    const records = memoryMailbox()
    const first = create(records)
    const root = binding("agy", "c-root", "7")
    first.messaging.register("G", here, "agy")
    first.messaging.observe("G", {
      binding: root,
      events: [observed(root, true)],
      statusLine: true,
    })
    sent(first.send("A", "agy", "hello"))
    first.messaging.close()
    const second = create(records)
    second.messaging.register("G", here, "agy")
    // The first report after the restart is a subagent's model call.
    const subagent = binding("agy", "c-sub", "8")
    second.messaging.observe("G", {
      binding: subagent,
      events: [observed(subagent), started(subagent, "call")],
    })
    expect(messages(second.messaging, "G")[0]?.state).toBe("queued")
    // The root's own call, which a message waits for, corrects the guess.
    const rooted = binding("agy", "c-root", "8")
    const answer = second.ask("G", rooted, "PreInvocation", [
      observed(rooted),
      started(rooted, "harness"),
    ])
    expect(answer.stdout).toContain("hello")
  })

  it("makes messages gone once restoring is over for a terminal never restored, until it is", () => {
    const records = memoryMailbox()
    const first = create(records)
    sent(first.send("A", "codex", "hello"))
    first.messaging.close()
    const second = new Messaging({ records, sweepMs: 0, restoreMs: 60_000 })
    second.register("A", here, "claude")
    vi.advanceTimersByTime(60_000)
    expect(records.messages()[0]?.state).toBe("gone")
    second.register("B", here, "codex")
    second.observe("B", { binding: binding("codex", "s-codex", "2"), events: [] })
    expect(records.messages()[0]?.state).toBe("queued")
    second.close()
  })

  it("gives a valid handle no record holds when the records can't give one", () => {
    const records = {
      ...memoryMailbox(),
      assignHandle: () => {
        throw new Error("disk full")
      },
    }
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const messaging = new Messaging({ records, sweepMs: 0, restoreMs: 0 })
    const one = messaging.register("A", here, "codex")
    const two = messaging.register("B", here, "codex")
    error.mockRestore()
    for (const handle of [one, two]) expect(handle).toMatch(/^codex-9\d{8}$/)
    expect(one).not.toBe(two)
  })
})

describe("gone messages", () => {
  it("are gone once the recipient's session ends, its sender told once, and wait again if it returns", () => {
    const { messaging, send, codex } = create()
    const { id } = sent(send("A", "codex", "hello"))
    messaging.observe("B", { binding: null, events: [] })
    expect(messages(messaging, "B")[0]?.state).toBe("gone")
    expect(send("A", "codex-1", "again")).toMatchObject({ ok: false })
    messaging.register("C", here, "term")
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
    setup.messaging.register("G", here, "agy")
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
    const idle: HarnessEvent = { type: "turn-idle", ...fact(root), background: false }
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

// What the terminal manager knows of B: its title and where it works.
const about = (terminalId: string): Whereabouts | undefined =>
  terminalId === "B"
    ? {
        title: "API author",
        folder: "src/api",
        branch: "feat/paging",
        plan: "Pagination",
        place: (path: string) => path.replace(/^\/w\//, ""),
      }
    : terminalId === "D"
      ? { title: "Web client", folder: null, branch: null, plan: null, place: (path) => path }
      : undefined

const prompted = (text: string, cause: "prompt" | "harness" = "prompt"): HarnessEvent => ({
  type: "turn-started",
  ...fact(binding("codex", "s-codex", "2")),
  cause,
  prompt: text,
})

const touched = (path: string): HarnessEvent => ({
  type: "file-touched",
  ...fact(binding("codex", "s-codex", "2")),
  actor: null,
  path,
})

describe("listing", () => {
  it("describes each other terminal by what NovaDeck knows, and the caller's messages yet to arrive", () => {
    const { messaging, send, ask, codex, clock } = create()
    messaging.register("C", here, "term")
    ask("B", codex, "UserPromptSubmit", [
      prompted(`Add pagination to /users ${"and more ".repeat(20)}`),
    ])
    clock.now += 1_000
    for (const path of [
      "/w/src/api/a.ts",
      "/w/src/api/b.ts",
      "/w/tests/a.ts",
      "/w/src/api/a.ts",
      "/w/docs/x.md",
      "/w/tests/b.ts",
      "/w/web/c.ts",
    ])
      messaging.observe("B", { binding: codex, events: [touched(path)] })
    clock.now += 1_000
    const { id } = sent(send("A", "codex", "Please accommodate x, y and z in the users route."))
    expect(messaging.agents("A", about)).toEqual({
      ok: true,
      handle: "claude-1",
      agents: [
        {
          handle: "codex-1",
          agent: "codex",
          title: "API author",
          folder: "src/api",
          branch: "feat/paging",
          startedWith: expect.stringMatching(/^Add pagination to \/users and more .*…$/),
          // The same as it started with: left out.
          latest: null,
          plan: "Pagination",
          worksIn: [
            { folder: "src/api/", edits: 3 },
            { folder: "tests/", edits: 2 },
            { folder: "docs/", edits: 1 },
          ],
          withYou: {
            from: "you",
            text: "Please accommodate x, y and z in the users route.",
            at: 1_002_000,
          },
          state: "busy",
          activeAt: 1_001_000,
        },
        {
          handle: "term-1",
          agent: null,
          title: null,
          folder: null,
          branch: null,
          startedWith: null,
          latest: null,
          plan: null,
          worksIn: [],
          withYou: null,
          state: null,
          activeAt: null,
        },
      ],
      messages: [{ id, to: "codex-1", state: "queued", sentAt: 1_002_000 }],
    })
    const [peer] = peersOf(messaging)
    expect(peer!.startedWith!.length).toBeLessThanOrEqual(120)
    expect(messaging.agents("C")).toMatchObject({ handle: "term-1", unbound: true })
  })

  it("tells the person's first and latest prompts, never a turn the harness started", () => {
    const { messaging, ask, codex } = create()
    ask("B", codex, "UserPromptSubmit", [prompted("Build the users API")])
    ask("B", codex, "UserPromptSubmit", [prompted("<task-notification>done", "harness")])
    const peer = () => peersOf(messaging)[0]
    expect(peer()).toMatchObject({ startedWith: "Build the users API", latest: null })
    ask("B", codex, "UserPromptSubmit", [prompted("Now add paging")])
    expect(peer()).toMatchObject({ startedWith: "Build the users API", latest: "Now add paging" })
  })

  it("keeps what a session worked on across a restart, and starts afresh for a new session", () => {
    const records = memoryMailbox()
    const first = create(records)
    first.ask("B", first.codex, "UserPromptSubmit", [prompted("Build the users API")])
    first.messaging.observe("B", { binding: first.codex, events: [touched("/w/src/api/a.ts")] })
    first.messaging.close()
    const second = create(records)
    const peer = (messaging: Messaging) => peersOf(messaging)[0]
    expect(peer(second.messaging)).toMatchObject({
      startedWith: "Build the users API",
      worksIn: [{ folder: "src/api/", edits: 1 }],
    })
    // Another session there, as after /clear, has done nothing yet.
    second.messaging.observe("B", { binding: binding("codex", "s-new", "2"), events: [] })
    expect(peer(second.messaging)).toMatchObject({ startedWith: null, worksIn: [] })
  })

  it("tells the latest message between the caller and each terminal, either way", () => {
    const { messaging, send, clock } = create()
    sent(send("A", "codex", "first"))
    clock.now += 1_000
    sent(send("B", "claude", `Done; ${"details ".repeat(20)}`))
    const [peer] = peersOf(messaging)
    expect(peer!.withYou).toEqual({
      from: "codex-1",
      text: expect.stringMatching(/^Done; details .*…$/),
      at: 1_001_000,
    })
  })

  it("lets only terminals of one project and NovaDeck session see each other", () => {
    const { messaging, send } = create()
    messaging.register("O", { projectId: "p", sessionId: "other" }, "codex")
    messaging.observe("O", { binding: binding("codex", "s-o", "9"), events: [] })
    expect(messaging.agents("A")).toMatchObject({ agents: [{ handle: "codex-1" }] })
    // The only Codex here is B's: O is in another session.
    expect(sent(send("A", "codex", "hi")).to).toBe("codex-1")
    expect(send("A", "codex-2", "hi")).toMatchObject({
      ok: false,
      reason: expect.stringContaining('No terminal here is called "codex-2"'),
    })
  })

  it("describes the candidates in one line each when the name it was given fits several", () => {
    const { messaging, send, ask, codex } = create()
    messaging.register("D", here, "codex")
    messaging.observe("D", { binding: binding("codex", "s-d", "4"), events: [] })
    ask("B", codex, "UserPromptSubmit", [prompted("Build the users API")])
    const refused = messaging.send("A", { to: "codex", text: "hi" }, about)
    expect(refused).toEqual({
      ok: false,
      reason: [
        "More than one terminal here runs Codex. Pick the one you mean by its title, folder " +
          "and work, and send to it by its handle; if you can't tell, ask the person.",
        '- codex-1 (Codex); titled "API author"; in src/api on feat/paging; started with ' +
          '"Build the users API"; plan "Pagination"',
        '- codex-2 (Codex); titled "Web client"',
      ].join("\n"),
    })
    expect(send("A", "reviewer", "hi")).toMatchObject({
      reason: expect.stringContaining('No terminal here is called "reviewer"'),
    })
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
