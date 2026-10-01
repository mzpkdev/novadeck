import { randomBytes } from "node:crypto"

import type { AgentName, MessageThread, TerminalMessages } from "@novadeck/protocol"
import { z } from "zod"

import { DomainError } from "../errors.js"
import type { Binding } from "../harnesses/bindings.js"
import type { HarnessEvent } from "../harnesses/events.js"
import { harnesses } from "../harnesses/registry.js"
import type { HookAnswer } from "../shell/reports.js"
import {
  continues,
  route,
  transition,
  unbound,
  type Delivery,
  type DeliveryEvent,
} from "./delivery.js"
import {
  allowSend,
  byteLength,
  cleanText,
  deliveryOf,
  duplicateOf,
  freshId,
  holdOf,
  hopsPerRelease,
  maxMessageBytes,
  maxUndelivered,
  rates,
  resolvePeer,
  retentionMs,
  threadBetween,
  undelivered,
  waiting,
  wrap,
  type Addressee,
  type Message,
  type Thread,
} from "./mailbox.js"
import { memoryMailbox, type MailboxRecords } from "./records.js"

/**
 * The agent session a terminal's messages are for: its bound session, except that
 * Antigravity names subagents' conversations alike, so there it is the conversation its
 * status line names, or until one does, that of the first model call after it bound.
 */
type Root = {
  readonly agent: AgentName
  readonly sessionId: string
  readonly instance: string | null
  readonly source: "binding" | "invocation" | "status-line"
}

/** A running terminal, as messaging knows it. */
type Live = {
  readonly terminalId: string
  readonly projectId: string
  readonly handle: string
  root: Root | null
  delivery: Delivery
  /** Counts its root turns, so a lease that lapses late leaves a later turn alone. */
  turn: number
  /** Antigravity: the delivery its turn's first model call printed, for each later call. */
  reinject: { readonly turn: number; readonly text: string } | null
}

/** Messages handed to a hook that has yet to say it printed them. */
type Lease = {
  readonly id: string
  readonly terminalId: string
  readonly messages: readonly string[]
  readonly kind: "stop" | "prompt"
  readonly turn: number
  readonly background: boolean
  readonly text: string
  readonly timer: ReturnType<typeof setTimeout>
}

/** What `send` answers: where the message is, or why it was refused. */
export type SendAnswer =
  | {
      readonly ok: true
      readonly to: string
      readonly id: string
      readonly state: Message["state"]
      /** When a queued message reaches its recipient. */
      readonly route?: string
      /** Why a held message waits. */
      readonly held?: "paused" | "release"
      /** Earlier messages from this terminal that won't arrive, told once. */
      readonly gone?: readonly { readonly id: string; readonly to: string }[]
      /** This terminal's own session never bound, so replies can't reach it. */
      readonly unbound?: true
    }
  | { readonly ok: false; readonly reason: string }

/** What `agents` answers: the other terminals in the project, and this one's undelivered messages. */
export type AgentsAnswer =
  | {
      readonly ok: true
      readonly handle: string
      readonly unbound?: true
      readonly agents: readonly {
        readonly handle: string
        readonly agent: AgentName | null
        readonly state: "busy" | "idle" | null
      }[]
      readonly messages: readonly {
        readonly id: string
        readonly to: string
        readonly state: Message["state"]
        readonly held?: "paused" | "release"
        readonly sentAt: number
      }[]
    }
  | { readonly ok: false; readonly reason: string }

export type MessagingOptions = {
  /** Where messages, handles and the pause are kept; in memory when omitted. */
  readonly records?: MailboxRecords
  readonly now?: () => number
  /** How long a lease waits for its hook's acknowledgement, in milliseconds. */
  readonly leaseMs?: number
  /** How often messages past retention are deleted, in milliseconds. */
  readonly sweepMs?: number
}

/** A lease is given only with this long left before its hook's deadline, in milliseconds. */
export const leaseMargin = 300

const sendRequest = z.strictObject({
  to: z.string().min(1).max(64),
  text: z.string().max(64 * 1024),
})

const refused = (reason: string) => ({ ok: false, reason }) as const

/** When a thread's latest message was sent. */
const latest = (thread: MessageThread): number => thread.messages.at(-1)?.sentAt ?? 0

// Whether an event comes from a terminal's root session, from its own process where known.
const rooted = (
  root: Root,
  event: {
    readonly agent: AgentName
    readonly sessionId: string
    readonly instance: string | null
  },
): boolean =>
  root.agent === event.agent &&
  root.sessionId === event.sessionId &&
  (root.instance === null || event.instance === null || root.instance === event.instance)

// Whether two processes may be the same, where the platform tells either.
const sameProcess = (a: string | null, b: string | null): boolean =>
  a === null || b === null || a === b

/**
 * Messages between the agents in NovaDeck's terminals (see docs/agent-messaging.md): the
 * mailbox, which keeps every message, thread and handle; each terminal's delivery state;
 * and the leases that hand messages to its hooks. The terminal manager tells it what its
 * terminals' agents and people do, and asks it what each hook prints.
 */
export class Messaging {
  private readonly records: MailboxRecords
  private readonly now: () => number
  private readonly leaseMs: number
  private readonly live = new Map<string, Live>()
  private readonly messages = new Map<string, Message>()
  private readonly threads = new Map<string, Thread>()
  private readonly leases = new Map<string, Lease>()
  private paused: boolean
  // Send times, for the rates: by sender, by sender and recipient, and all.
  private readonly sent = new Map<string, readonly number[]>()
  private readonly pairs = new Map<string, readonly number[]>()
  private allSent: readonly number[] = []
  private readonly sweeper: ReturnType<typeof setInterval> | undefined

  constructor(options: MessagingOptions = {}) {
    this.records = options.records ?? memoryMailbox()
    this.now = options.now ?? Date.now
    this.leaseMs = options.leaseMs ?? 5_000
    this.paused = this.read(() => this.records.messagingPaused(), false)
    for (const thread of this.read(() => this.records.threads(), []))
      this.threads.set(thread.id, thread)
    for (const message of this.read(() => this.records.messages(), [])) {
      this.messages.set(message.id, message)
      // A lease held when the runner stopped is gone with it: its messages wait again.
      if (message.state === "leased" || message.state === "queued" || message.state === "held")
        this.wait(message)
    }
    this.sweep()
    if (options.sweepMs !== 0) {
      this.sweeper = setInterval(() => this.sweep(), options.sweepMs ?? 60 * 60_000)
      this.sweeper.unref()
    }
  }

  /** Stops its timers; leases left go back to waiting with the next runner. */
  close(): void {
    clearInterval(this.sweeper)
    for (const lease of this.leases.values()) clearTimeout(lease.timer)
    this.leases.clear()
  }

  /**
   * A terminal starts, or starts again: its handle, which it keeps across its shells and
   * restores, or the next one in its project for `prefix`.
   */
  register(terminalId: string, projectId: string, prefix: string): string {
    const known = this.live.get(terminalId)
    if (known) return known.handle
    const handle = this.write(
      () => this.records.assignHandle(terminalId, projectId, prefix),
      `${prefix}-0`,
    )
    this.write(() => this.records.markRemoved(terminalId, null), undefined)
    this.live.set(terminalId, {
      terminalId,
      projectId,
      handle,
      root: null,
      delivery: unbound,
      turn: 0,
      reinject: null,
    })
    return handle
  }

  /** A terminal stops running: its agent's messages are gone until its session runs again. */
  unregister(terminalId: string): void {
    const live = this.live.get(terminalId)
    if (!live) return
    this.unroot(live)
    this.live.delete(terminalId)
  }

  /** The terminal's handle, while it runs. */
  handle(terminalId: string): string | undefined {
    return this.live.get(terminalId)?.handle
  }

  /** The terminal's delivery state, while it runs. */
  delivery(terminalId: string): Delivery | undefined {
    return this.live.get(terminalId)?.delivery
  }

  /**
   * What the terminal's hooks reported, once the terminal manager applied it: the
   * session bound there now, and the facts decoded from the report. A `statusLine`
   * report names its harness's root session. Unless the report asks, nothing is printed.
   */
  observe(
    terminalId: string,
    report: {
      readonly binding: Binding | null
      readonly events: readonly HarnessEvent[]
      readonly statusLine?: boolean
    },
  ): void {
    const live = this.live.get(terminalId)
    if (!live) return
    this.rooting(live, report.binding, report.events, report.statusLine === true)
    for (const event of report.events) this.turn(live, event)
  }

  /**
   * What a Stop or prompt-time hook prints, as it asks once its report is applied: the
   * messages waiting for the terminal's root session, leased to it, when its report is a
   * root turn event that may take them and its `deadline` leaves time to print them.
   * Antigravity's later model calls of a turn get the turn's delivery again.
   */
  ask(
    terminalId: string,
    report: {
      readonly agent: AgentName
      readonly event: string
      readonly binding: Binding | null
      readonly events: readonly HarnessEvent[]
      readonly deadline: number
    },
  ): HookAnswer {
    const { answers } = harnesses[report.agent]
    const silent = { leaseId: null, stdout: answers.silent(report.event) }
    const kind = answers.asks[report.event]
    const live = this.live.get(terminalId)
    if (!live || !kind) {
      if (live) this.observe(terminalId, report)
      return silent
    }
    this.rooting(live, report.binding, report.events, false)
    const root = live.root
    // The Stop is this ask's own to settle, by whether it continues the turn.
    const stop =
      kind === "stop" && root
        ? report.events.find(
            (event): event is Extract<HarnessEvent, { type: "turn-ended" }> =>
              event.type === "turn-ended" && event.outcome === "completed" && rooted(root, event),
          )
        : undefined
    for (const event of report.events) if (event !== stop) this.turn(live, event)
    if (!root) return silent
    const time = report.deadline - this.now() >= leaseMargin
    if (stop) {
      const background = stop.background === true
      const lease = time && continues(live.delivery) && this.lease(live, root, "stop", background)
      this.step(live, { type: "stop", continued: Boolean(lease), background })
      return lease ? { leaseId: lease.id, stdout: answers.stop(lease.text) } : silent
    }
    if (kind !== "prompt") return silent
    const start = report.events.find(
      (event): event is Extract<HarnessEvent, { type: "turn-started" }> =>
        event.type === "turn-started" && rooted(root, event),
    )
    if (!start) return silent
    // A later model call of the turn sees again what its first was given.
    if (start.cause === "call") {
      const again = live.reinject?.turn === live.turn ? live.reinject.text : undefined
      return again ? { leaseId: null, stdout: answers.prompt(again) } : silent
    }
    const lease = time && this.lease(live, root, "prompt", false)
    return lease ? { leaseId: lease.id, stdout: answers.prompt(lease.text) } : silent
  }

  /**
   * A hook printed what its lease delivers: its messages are delivered. An ack for a
   * lease that lapsed, was given again, or is another terminal's, is ignored.
   */
  acknowledge(terminalId: string, leaseId: string): void {
    const lease = this.leases.get(leaseId)
    if (!lease || lease.terminalId !== terminalId) return
    clearTimeout(lease.timer)
    this.leases.delete(leaseId)
    const at = this.now()
    for (const id of lease.messages) {
      const message = this.messages.get(id)
      if (message?.state === "leased") this.put({ ...message, state: "delivered", deliveredAt: at })
    }
    const live = this.live.get(terminalId)
    if (live && lease.kind === "prompt" && live.root?.agent === "agy")
      live.reinject = { turn: lease.turn, text: lease.text }
  }

  /**
   * The person's input to the terminal, apart from its automatic replies: a prompt they
   * `submit`, unless it `answers` a request waiting on them.
   */
  input(terminalId: string, input: { readonly submits: boolean; readonly answers: boolean }): void {
    const live = this.live.get(terminalId)
    if (live) this.step(live, { type: "input", ...input })
  }

  /**
   * An agent's message to another terminal in its project, by handle or by its agent's
   * name. It never claims delivery: it answers where the message is, or why not.
   */
  send(terminalId: string, request: unknown): SendAnswer {
    const live = this.live.get(terminalId)
    if (!live) return refused("NovaDeck couldn't send the message.")
    const parsed = sendRequest.safeParse(request)
    if (!parsed.success)
      return refused("A message needs `to`, a terminal's handle, and its `text`.")
    const text = cleanText(parsed.data.text)
    if (!text.trim()) return refused("The message is empty.")
    if (byteLength(text) > maxMessageBytes)
      return refused(
        "The message is longer than 4 KB; put longer content in a file the recipient can " +
          "open, and send its path.",
      )
    const found = resolvePeer(parsed.data.to, this.peers(live), live.handle)
    if (!found.ok) return refused(found.reason)
    const recipient = this.live.get(found.peer.terminalId)!
    const root = recipient.root
    if (!root)
      return refused(`${recipient.handle} has no agent running there that NovaDeck can deliver to.`)
    const now = this.now()
    const extras = this.extras(live)
    const same = duplicateOf(this.messages.values(), terminalId, recipient.terminalId, text, now)
    if (same) return { ...this.answer(same, recipient), ...extras }
    const waitingThere = [...this.messages.values()].filter(
      (message) => message.to.terminalId === recipient.terminalId && undelivered(message),
    ).length
    if (waitingThere >= maxUndelivered)
      return refused(
        `${recipient.handle} already has ${maxUndelivered} messages waiting; ` +
          "wait for it to take them before sending more.",
      )
    const pair = `${terminalId}\0${recipient.terminalId}`
    const bySender = allowSend(this.sent.get(terminalId) ?? [], now, rates.sender)
    const byPair = allowSend(this.pairs.get(pair) ?? [], now, rates.pair)
    const byAll = allowSend(this.allSent, now, rates.all)
    if (!bySender || !byPair)
      return refused(
        `An agent may send ${rates.sender} messages a minute, ${rates.pair} of them to any ` +
          "one terminal; try again shortly.",
      )
    if (!byAll)
      return refused(
        "Agents in NovaDeck have sent as many messages as they may this minute; try again shortly.",
      )
    this.sent.set(terminalId, bySender)
    this.pairs.set(pair, byPair)
    this.allSent = byAll
    const thread = this.continueThread(live, recipient, now)
    const to: Addressee = {
      terminalId: recipient.terminalId,
      handle: recipient.handle,
      agent: root.agent,
      sessionId: root.sessionId,
    }
    const message: Message = {
      id: this.freshMessageId(),
      projectId: live.projectId,
      thread: thread.id,
      hop: thread.hops,
      from: {
        terminalId,
        handle: live.handle,
        agent: live.root?.agent ?? null,
        sessionId: live.root?.sessionId ?? null,
      },
      to,
      text,
      sentAt: now,
      state: waiting({ hop: thread.hops }, thread, this.paused),
      deliveredAt: null,
      notified: false,
    }
    this.put(message)
    return { ...this.answer(message, recipient), ...extras }
  }

  /**
   * The other terminals in the caller's project, with their agents and whether each is
   * busy, and the caller's own messages not yet delivered or gone.
   */
  agents(terminalId: string): AgentsAnswer {
    const live = this.live.get(terminalId)
    if (!live) return refused("NovaDeck couldn't list the terminals.")
    const agents = this.peers(live).map(({ terminalId: id }) => {
      const peer = this.live.get(id)!
      const busy = peer.delivery.state === "working"
      const state = peer.root ? (busy ? ("busy" as const) : ("idle" as const)) : null
      return { handle: peer.handle, agent: peer.root?.agent ?? null, state }
    })
    const messages = [...this.messages.values()]
      .filter(
        (message) =>
          message.from.terminalId === terminalId &&
          (undelivered(message) || message.state === "gone"),
      )
      .toSorted((a, b) => a.sentAt - b.sentAt)
    for (const message of messages)
      if (message.state === "gone" && !message.notified) this.put({ ...message, notified: true })
    return {
      ok: true,
      handle: live.handle,
      ...(live.root === null && { unbound: true as const }),
      agents,
      messages: messages.map((message) => {
        const held = this.holdOf(message)
        return {
          id: message.id,
          to: message.to.handle,
          state: message.state,
          ...(message.state === "held" && held && { held }),
          sentAt: message.sentAt,
        }
      }),
    }
  }

  /**
   * The terminal's threads and messages with their states, for the runner API; an exited
   * terminal's too, while its handle is kept.
   */
  list(terminalId: string): TerminalMessages {
    const live =
      this.live.get(terminalId) ??
      this.read(() => this.records.handles(), []).find((each) => each.terminalId === terminalId)
    if (!live) throw new DomainError("TERMINAL_NOT_FOUND")
    const delivery = "delivery" in live ? live.delivery.state : "unbound"
    const mine = [...this.messages.values()]
      .filter(({ from, to }) => from.terminalId === terminalId || to.terminalId === terminalId)
      .toSorted((a, b) => a.sentAt - b.sentAt)
    const byThread = new Map<string, Message[]>()
    for (const message of mine)
      byThread.set(message.thread, [...(byThread.get(message.thread) ?? []), message])
    const threads: MessageThread[] = [...byThread].map(([id, messages]) => {
      const thread = this.threads.get(id)
      const [first] = messages
      const peer = first!.from.terminalId === terminalId ? first!.to.handle : first!.from.handle
      return {
        id,
        peer,
        hops: thread?.hops ?? messages.length,
        allowed: thread?.allowed ?? hopsPerRelease,
        held: messages.some(
          (message) => message.state === "held" && this.holdOf(message) === "release",
        ),
        messages: messages.slice(-1000).map((message) => ({
          id: message.id,
          thread: message.thread,
          hop: message.hop,
          from: message.from.handle,
          fromAgent: message.from.agent,
          to: message.to.handle,
          toAgent: message.to.agent,
          text: message.text,
          sentAt: message.sentAt,
          state: message.state,
          held: message.state === "held" ? this.holdOf(message) : null,
          deliveredAt: message.deliveredAt,
        })),
      }
    })
    return {
      terminalId,
      handle: live.handle,
      delivery,
      paused: this.paused,
      threads: threads.toSorted((a, b) => latest(b) - latest(a)).slice(0, 1000),
    }
  }

  /** Whether all delivery is paused. */
  isPaused(): boolean {
    return this.paused
  }

  /**
   * Pauses all delivery, or resumes it, keeping the switch: waiting messages are held
   * while paused, and wait in order again once resumed.
   */
  pause(paused: boolean): void {
    this.write(() => this.records.pauseMessaging(paused), undefined)
    this.paused = paused
    for (const message of this.messages.values())
      if (message.state === "queued" || message.state === "held") this.wait(message)
  }

  /** Releases a thread: its held messages wait to be delivered, and it may have 12 more. */
  release(threadId: string): void {
    const thread = this.threads.get(threadId)
    if (!thread) throw new DomainError("NOT_FOUND")
    this.putThread({ ...thread, allowed: thread.hops + hopsPerRelease })
    for (const message of this.messages.values())
      if (message.thread === threadId && message.state === "held") this.wait(message)
  }

  /**
   * Deletes messages once neither of their terminals has run or been saved for a day, and
   * what only they kept: their threads, and the gone terminals' handles.
   */
  sweep(): void {
    const now = this.now()
    const handles = this.read(() => this.records.handles(), [])
    const gone = new Map<string, number>()
    for (const record of handles) {
      const present =
        this.live.has(record.terminalId) ||
        this.read(() => this.records.terminalSaved(record.terminalId), true)
      if (present && record.removedAt !== null)
        this.write(() => this.records.markRemoved(record.terminalId, null), undefined)
      if (present) continue
      const since = record.removedAt ?? now
      if (record.removedAt === null)
        this.write(() => this.records.markRemoved(record.terminalId, now), undefined)
      gone.set(record.terminalId, since)
    }
    const expired = (terminalId: string) => {
      const since = gone.get(terminalId)
      return since !== undefined && now - since >= retentionMs
    }
    const old = [...this.messages.values()].filter(
      ({ from, to }) => expired(from.terminalId) && expired(to.terminalId),
    )
    for (const { id } of old) this.messages.delete(id)
    if (old.length > 0)
      this.write(() => this.records.removeMessages(old.map(({ id }) => id)), undefined)
    const kept = new Set([...this.messages.values()].map(({ thread }) => thread))
    const threads = [...this.threads.keys()].filter((id) => !kept.has(id))
    for (const id of threads) this.threads.delete(id)
    if (threads.length > 0) this.write(() => this.records.removeThreads(threads), undefined)
    const mentioned = new Set(
      [...this.messages.values()].flatMap(({ from, to }) => [from.terminalId, to.terminalId]),
    )
    const forgotten = [...gone.keys()].filter((id) => expired(id) && !mentioned.has(id))
    if (forgotten.length > 0) this.write(() => this.records.removeHandles(forgotten), undefined)
  }

  /** The other running terminals in the terminal's project. */
  private peers(live: Live) {
    return [...this.live.values()]
      .filter((peer) => peer.projectId === live.projectId && peer.terminalId !== live.terminalId)
      .map((peer) => ({
        terminalId: peer.terminalId,
        handle: peer.handle,
        agent: peer.root?.agent ?? null,
      }))
  }

  /** What `send` answers of a message to `recipient`. */
  private answer(message: Message, recipient: Live): SendAnswer {
    const base = { ok: true, to: message.to.handle, id: message.id, state: message.state } as const
    if (message.state === "held") {
      const held = this.holdOf(message)
      return held ? { ...base, held } : base
    }
    if (message.state !== "queued") return base
    return { ...base, route: route(recipient.delivery, recipient.root?.agent === "codex") }
  }

  /** What every answer to the sender adds: its messages newly gone, and whether replies reach it. */
  private extras(live: Live) {
    const gone = [...this.messages.values()].filter(
      (message) =>
        message.from.terminalId === live.terminalId &&
        message.state === "gone" &&
        !message.notified,
    )
    for (const message of gone) this.put({ ...message, notified: true })
    return {
      ...(gone.length > 0 && {
        gone: gone.map((message) => ({ id: message.id, to: message.to.handle })),
      }),
      ...(live.root === null && { unbound: true as const }),
    }
  }

  /** The thread a message from `live` to `recipient` continues, or a new one, with its hop. */
  private continueThread(live: Live, recipient: Live, now: number): Thread {
    const found = threadBetween(this.threads.values(), live.terminalId, recipient.terminalId, now)
    const thread: Thread = found
      ? { ...found, hops: found.hops + 1, lastAt: now }
      : {
          id: this.freshThreadId(),
          projectId: live.projectId,
          between: [live.terminalId, recipient.terminalId],
          hops: 1,
          allowed: hopsPerRelease,
          lastAt: now,
        }
    this.putThread(thread)
    return thread
  }

  private holdOf(message: Message): "paused" | "release" | null {
    return holdOf(message, this.threads.get(message.thread), this.paused)
  }

  /** Puts an undelivered message back to waiting: held for a reason, else queued. */
  private wait(message: Message): void {
    const state = waiting(message, this.threads.get(message.thread), this.paused)
    if (state !== message.state) this.put({ ...message, state })
  }

  /**
   * Leases the messages waiting for the root session, as many as one delivery carries,
   * until the hook acknowledges them or `leaseMs` passes; none when none wait.
   */
  private lease(
    live: Live,
    root: Root,
    kind: Lease["kind"],
    background: boolean,
  ): Lease | undefined {
    const queued = [...this.messages.values()]
      .filter(
        ({ to, state }) =>
          state === "queued" &&
          to.terminalId === live.terminalId &&
          to.agent === root.agent &&
          to.sessionId === root.sessionId,
      )
      .toSorted((a, b) => a.sentAt - b.sentAt)
    const messages = deliveryOf(queued)
    if (messages.length === 0) return undefined
    for (const message of messages) this.put({ ...message, state: "leased" })
    let id = randomBytes(18).toString("base64url")
    while (this.leases.has(id)) id = randomBytes(18).toString("base64url")
    const timer = setTimeout(() => this.lapse(id), this.leaseMs)
    timer.unref()
    const lease: Lease = {
      id,
      terminalId: live.terminalId,
      messages: messages.map((message) => message.id),
      kind,
      turn: live.turn,
      background,
      text: wrap(messages),
      timer,
    }
    this.leases.set(id, lease)
    return lease
  }

  /**
   * A lease its hook never acknowledged: its messages wait again. A Stop it would have
   * continued was not continued, so its turn ended there.
   */
  private lapse(leaseId: string): void {
    const lease = this.leases.get(leaseId)
    if (!lease) return
    this.leases.delete(leaseId)
    for (const id of lease.messages) {
      const message = this.messages.get(id)
      if (message?.state === "leased") this.wait(message)
    }
    const live = this.live.get(lease.terminalId)
    if (live && lease.kind === "stop" && live.turn === lease.turn)
      this.step(live, { type: "stop", continued: false, background: lease.background })
  }

  /**
   * Follows the terminal's root session as its binding and reports change it. A new
   * binding, or a session its harness announced, is a new root. Antigravity names
   * subagents' conversations as it does its own, so there only its status line names a
   * new root; until it has, its first model call after binding says which it is.
   */
  private rooting(
    live: Live,
    binding: Binding | null,
    events: readonly HarnessEvent[],
    statusLine: boolean,
  ): void {
    if (!binding) {
      if (live.root) this.unroot(live)
      return
    }
    const root = live.root
    if (!root || root.agent !== binding.agent || !sameProcess(root.instance, binding.instance)) {
      const source = statusLine && binding.agent === "agy" ? "status-line" : "binding"
      this.rootAt(live, { ...binding, source })
    } else if (binding.agent !== "agy" && root.sessionId !== binding.sessionId)
      this.rootAt(live, { ...binding, source: "binding" })
    if (binding.agent !== "agy") return
    for (const event of events) {
      const current = live.root!
      if (event.agent !== "agy" || !sameProcess(current.instance, event.instance)) continue
      if (event.type === "session-observed" && event.root && statusLine) {
        if (event.sessionId === current.sessionId) {
          if (current.source !== "status-line") live.root = { ...current, source: "status-line" }
        } else if (current.source === "status-line")
          // A new conversation its status line names: a /clear, or another resumed.
          this.rootAt(live, { ...current, sessionId: event.sessionId, instance: event.instance })
        else this.retarget(live, event.sessionId, "status-line")
      }
      if (event.type === "turn-started" && !statusLine && current.source === "binding")
        this.retarget(live, event.sessionId, "invocation")
    }
  }

  /**
   * A new root session in the terminal: messages for any other session there are gone,
   * as after a runner restart, and the new one's that were gone wait again.
   */
  private rootAt(live: Live, root: Root): void {
    live.root = root
    live.turn += 1
    live.reinject = null
    this.step(live, { type: "bound" })
    for (const message of this.messages.values()) {
      if (message.to.terminalId !== live.terminalId) continue
      if (this.addressed(message, live, root)) {
        if (message.state === "gone") this.wait(message)
      } else if (undelivered(message)) this.put({ ...message, state: "gone", notified: false })
    }
  }

  /** The terminal's root session ended: its messages are gone, until it runs again. */
  private unroot(live: Live): void {
    live.root = null
    live.reinject = null
    this.step(live, { type: "unbound" })
    for (const message of this.messages.values())
      if (message.to.terminalId === live.terminalId && undelivered(message))
        this.put({ ...message, state: "gone", notified: false })
  }

  /** Corrects the root's session, as a guess at it is replaced by a better one. */
  private retarget(live: Live, sessionId: string, source: Root["source"]): void {
    const root = live.root!
    live.root = { ...root, sessionId, source }
    if (sessionId === root.sessionId) return
    for (const message of this.messages.values())
      if (undelivered(message) && this.addressed(message, live, root))
        this.put({ ...message, to: { ...message.to, sessionId } })
  }

  private addressed(message: Message, live: Live, root: Root): boolean {
    return (
      message.to.terminalId === live.terminalId &&
      message.to.agent === root.agent &&
      message.to.sessionId === root.sessionId
    )
  }

  /** Applies a root turn event to the terminal's delivery. */
  private turn(live: Live, event: HarnessEvent): void {
    const root = live.root
    if (!root || !rooted(root, event)) return
    switch (event.type) {
      case "turn-started":
        this.step(live, { type: "prompt", by: event.cause === "prompt" ? "person" : event.cause })
        return
      case "turn-ended":
        if (event.outcome === "completed")
          this.step(live, { type: "stop", continued: false, background: event.background === true })
        else this.step(live, { type: "ended" })
        return
      case "turn-idle":
        if (live.delivery.state === "working") this.step(live, { type: "ended" })
        return
      default:
        return
    }
  }

  private step(live: Live, event: DeliveryEvent): void {
    const before = live.delivery
    live.delivery = transition(before, event)
    // A new turn, or the end of one, leaves the last turn's leases and deliveries behind.
    const started = event.type === "prompt" && event.by !== "call" && before.state !== "working"
    const ended = live.delivery.state !== "working" && before.state === "working"
    if (started || ended) {
      live.turn += 1
      live.reinject = null
    }
  }

  private freshMessageId(): string {
    let id = freshId("m")
    while (this.messages.has(id)) id = freshId("m")
    return id
  }

  private freshThreadId(): string {
    let id = freshId("t")
    while (this.threads.has(id)) id = freshId("t")
    return id
  }

  private put(message: Message): void {
    this.messages.set(message.id, message)
    this.write(() => this.records.saveMessage(message), undefined)
  }

  private putThread(thread: Thread): void {
    this.threads.set(thread.id, thread)
    this.write(() => this.records.saveThread(thread), undefined)
  }

  /** Reads the records; a failure is logged and gives `fallback`. */
  private read<T>(work: () => T, fallback: T): T {
    try {
      return work()
    } catch (error) {
      console.error("NovaDeck could not read its messages:", error)
      return fallback
    }
  }

  /** Writes to the records; a failure is logged, and the runner carries on with `fallback`. */
  private write<T>(work: () => T, fallback: T): T {
    try {
      return work()
    } catch (error) {
      console.error("NovaDeck could not save its messages:", error)
      return fallback
    }
  }
}
