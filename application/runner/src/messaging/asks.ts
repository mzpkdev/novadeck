import { randomUUID } from "node:crypto"

import {
  agentAsk,
  askAnswer,
  type AgentAsk,
  type AskAnswer,
  type InboxLetter,
  type TerminalMessages,
} from "@novadeck/protocol"
import { z } from "zod"

import { DomainError } from "../errors.js"
import type { RootChange } from "../harnesses/roots.js"
import { Latest } from "../terminals/latest.js"
import { byteLength, type Message } from "./mailbox.js"

// Resolved letters stay as the Messages pane's history. Only open letters reach Inbox.
export type Letter = InboxLetter & {
  readonly state: "open" | "answered" | "read" | "withdrawn" | "gone"
}
export type AskRecords = {
  letters(): readonly Letter[]
  saveLetter(letter: Letter): void
  answerLetter(letter: Letter, message: Message): void
  removeLetters(ids: readonly string[]): void
}
export const memoryAsks = (): AskRecords => {
  const letters = new Map<string, Letter>()
  return {
    letters: () => [...letters.values()],
    saveLetter: (letter) => void letters.set(letter.id, letter),
    answerLetter: (letter) => void letters.set(letter.id, letter),
    removeLetters: (ids) => {
      for (const id of ids) letters.delete(id)
    },
  }
}

type Owner = Omit<InboxLetter, "id" | "at" | "content">
type Host = {
  owner(terminalId: string): Owner | undefined
  reply(
    terminalId: string,
    askId: string,
    subject: string,
    text: string,
    commit: (message: Message) => void,
  ): void
  changed(terminalId: string): void
  exists(terminalId: string): boolean
}

const subject = z
  .string()
  .trim()
  .min(1)
  .max(256)
  // eslint-disable-next-line no-control-regex -- Subjects cannot contain control characters.
  .refine((text) => !/[\r\n\x00-\x1f]/.test(text), "Use one line for the subject")
const markdown = z.string().max(16_384)
const option = z.strictObject({
  label: subject,
  summary: z.string().max(2048).nullable().optional(),
  details: markdown.nullable().optional(),
  code: z.strictObject({ path: subject, text: markdown }).nullable().optional(),
})
const requestedShape = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text") }),
  z.strictObject({
    type: z.literal("options"),
    options: z.array(option).min(1).max(3),
    recommend: z.number().int().min(0).max(2).nullable().optional(),
  }),
  z.strictObject({
    type: z.literal("action"),
    command: z.string().trim().min(1).max(4096),
    directory: z.string().max(4096).nullable().optional(),
    done_label: subject,
  }),
])
const askRequest = z.strictObject({
  subject,
  body: markdown,
  details: markdown.nullable().optional(),
  hard_to_undo: z.string().max(2048).nullable().optional(),
  shape: requestedShape.optional(),
})
const tellRequest = z.strictObject({ subject, body: markdown })
const withdrawRequest = z.strictObject({ withdraw: z.uuid() })
const failure = (error: unknown) => ({
  ok: false as const,
  reason: error instanceof Error ? error.message : "Novadeck couldn't save that item.",
})
const same = (letter: InboxLetter, owner: Owner | undefined): boolean =>
  owner !== undefined &&
  letter.projectId === owner.projectId &&
  letter.workspaceSessionId === owner.workspaceSessionId &&
  letter.agent === owner.agent &&
  letter.sessionId === owner.sessionId

// A plain-text record of everything the person saw, retained after the sheet clears.
const askText = (ask: AgentAsk): string => {
  const { shape } = ask
  const choices =
    shape.type === "options"
      ? shape.options
          .map((each, index) =>
            [
              `${index + 1}. ${each.label}${shape.recommend === index ? " (recommended)" : ""}`,
              each.summary,
              each.details,
              each.code && `${each.code.path}\n${each.code.text}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          )
          .join("\n\n")
      : shape.type === "action"
        ? [shape.command, shape.directory, shape.doneLabel].filter(Boolean).join("\n")
        : null
  return [
    ask.subject,
    ask.body,
    ask.details,
    ask.hardToUndo && `Hard to undo: ${ask.hardToUndo}`,
    choices,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export class Asks {
  private readonly letters = new Map<string, Letter>()
  private readonly readers = new Set<Latest<InboxLetter[]>>()
  private closed = false
  constructor(
    private readonly host: Host,
    private readonly records: AskRecords = memoryAsks(),
    private readonly now = Date.now,
  ) {
    for (const letter of records.letters()) this.letters.set(letter.id, letter)
  }

  call(
    terminalId: string,
    kind: "ask" | "tell",
    request: unknown,
  ): { ok: true; id: string; withdrawn?: true } | { ok: false; reason: string } {
    if (this.closed) return failure(new Error("Novadeck is stopping."))
    const owner = this.host.owner(terminalId)
    if (!owner)
      return failure(
        new Error(
          "Your agent session has not bound in this terminal yet, so an answer could not reach you.",
        ),
      )
    try {
      const withdrawing = withdrawRequest.safeParse(request)
      if (kind === "ask" && withdrawing.success) {
        const letter = this.letters.get(withdrawing.data.withdraw)
        if (
          !letter ||
          letter.terminalId !== terminalId ||
          !same(letter, owner) ||
          letter.content.kind !== "ask" ||
          letter.state !== "open"
        )
          throw new Error("That ask is no longer open in your session.")
        this.put({ ...letter, state: "withdrawn" })
        return { ok: true, id: letter.id, withdrawn: true }
      }
      const content =
        kind === "tell"
          ? { kind: "tell" as const, ...tellRequest.parse(request) }
          : (() => {
              const read = askRequest.parse(request)
              const choice = read.shape ?? { type: "text" as const }
              const normalized =
                choice.type === "options"
                  ? {
                      ...choice,
                      recommend: choice.recommend ?? null,
                      options: choice.options.map((each) => ({
                        ...each,
                        summary: each.summary ?? null,
                        details: each.details ?? null,
                        code: each.code ?? null,
                      })),
                    }
                  : choice.type === "action"
                    ? {
                        type: "action" as const,
                        command: choice.command,
                        directory: choice.directory ?? null,
                        doneLabel: choice.done_label,
                      }
                    : choice
              return {
                kind: "ask" as const,
                ask: agentAsk.parse({
                  subject: read.subject,
                  body: read.body,
                  details: read.details ?? null,
                  hardToUndo: read.hard_to_undo ?? null,
                  shape: normalized,
                }),
              }
            })()
      if (byteLength(JSON.stringify(content)) > 32_768)
        throw new Error(
          "This Inbox item is over 32 KB. Shorten its details or put longer content in a file.",
        )
      const open = [...this.letters.values()].filter(
        (each) => each.terminalId === terminalId && each.state === "open",
      )
      if (open.length >= 50)
        throw new Error(
          "You already have 50 Inbox items waiting. Withdraw an ask before adding another.",
        )
      const letter: Letter = { id: randomUUID(), ...owner, at: this.now(), content, state: "open" }
      this.put(letter)
      return { ok: true, id: letter.id }
    } catch (error) {
      return failure(error)
    }
  }

  list(): InboxLetter[] {
    return [...this.letters.values()]
      .filter(
        (each) =>
          each.state === "open" &&
          (each.content.kind === "tell"
            ? this.host.exists(each.terminalId)
            : same(each, this.host.owner(each.terminalId))),
      )
      .map(({ state: _state, ...letter }) => letter)
  }

  answer(id: string, input: AskAnswer): void {
    if (this.closed) throw new DomainError("RUNTIME_CLOSING")
    const letter = this.letters.get(id)
    if (
      !letter ||
      letter.state !== "open" ||
      letter.content.kind !== "ask" ||
      !same(letter, this.host.owner(letter.terminalId))
    )
      throw new DomainError("CONFLICT", "This ask is no longer waiting in that agent session.")
    const parsed = askAnswer.safeParse(input)
    if (!parsed.success) throw new DomainError("ANSWER_FAILED", "That answer doesn't fit this ask.")
    const answer = parsed.data
    const { ask } = letter.content
    let text: string
    if (answer.type === "done") {
      if (ask.shape.type !== "action")
        throw new DomainError("ANSWER_FAILED", "This ask has no action to mark done.")
      text = ask.shape.doneLabel
    } else {
      const picked = answer.option
      if (picked !== null && (ask.shape.type !== "options" || !ask.shape.options[picked]))
        throw new DomainError("ANSWER_FAILED", "Choose one of this ask's options.")
      const label =
        picked !== null && ask.shape.type === "options" ? ask.shape.options[picked]!.label : ""
      text = [label, answer.text.trim()].filter(Boolean).join("\n\n")
      if (!text) throw new DomainError("ANSWER_FAILED", "Write an answer or choose an option.")
    }
    const answered: Letter = { ...letter, state: "answered" }
    this.host.reply(letter.terminalId, letter.id, ask.subject, text, (message) => {
      this.records.answerLetter(answered, message)
      this.letters.set(id, answered)
    })
    this.changed(letter.terminalId)
  }

  read(ids: readonly string[]): void {
    if (this.closed) throw new DomainError("RUNTIME_CLOSING")
    for (const id of ids) {
      const letter = this.letters.get(id)
      if (letter?.state === "open" && letter.content.kind === "tell")
        this.put({ ...letter, state: "read" })
    }
  }

  rooted(terminalId: string, changes: readonly RootChange[]): void {
    if (this.closed) return
    for (const change of changes) {
      if (change.type === "corrected")
        for (const letter of this.letters.values())
          if (
            letter.terminalId === terminalId &&
            letter.state === "open" &&
            letter.content.kind === "ask" &&
            letter.agent === change.root.agent &&
            letter.sessionId === change.from
          )
            this.put({ ...letter, sessionId: change.root.sessionId })
    }
    const last = changes.at(-1)
    if (last?.type === "new" && last.guess) {
      this.changed(terminalId)
      return
    }
    this.reconcile(terminalId)
  }

  reconcile(terminalId: string): void {
    if (this.closed) return
    const owner = this.host.owner(terminalId)
    for (const letter of this.letters.values())
      if (
        letter.terminalId === terminalId &&
        letter.state === "open" &&
        (letter.content.kind === "ask" ? !same(letter, owner) : !this.host.exists(terminalId))
      )
        this.put({ ...letter, state: "gone" })
    this.changed(terminalId)
  }

  history(terminalId: string, listing: TerminalMessages): TerminalMessages {
    const letters = [...this.letters.values()].filter((each) => each.terminalId === terminalId)
    const threads = [...listing.threads]
    for (const letter of letters) {
      const thread = `t-${letter.id.replaceAll("-", "")}`
      const found = threads.findIndex((each) => each.id === thread)
      const content = letter.content
      const text =
        content.kind === "ask" ? askText(content.ask) : `${content.subject}\n\n${content.body}`
      const trace = {
        id: `m-${letter.id.replaceAll("-", "")}`,
        thread,
        hop: 1,
        from: letter.handle,
        fromAgent: letter.agent,
        to: "you",
        toAgent: letter.agent,
        text,
        sentAt: letter.at,
        state: "delivered" as const,
        held: null,
        deliveredAt: letter.at,
        inbox: content.kind,
      }
      const known = found >= 0 ? threads[found] : undefined
      const messages = [trace, ...(known?.messages ?? [])]
      const entry = {
        id: thread,
        peer: "you",
        hops: messages.length,
        allowed: 0,
        held: false,
        stopped: false,
        messages,
      }
      if (found < 0) threads.push(entry)
      else threads[found] = entry
    }
    return {
      ...listing,
      threads: threads
        .toSorted((a, b) => (b.messages.at(-1)?.sentAt ?? 0) - (a.messages.at(-1)?.sentAt ?? 0))
        .slice(0, 1000),
    }
  }

  forgetProject(projectId: string): void {
    const gone = [...this.letters.values()].filter((each) => each.projectId === projectId)
    this.records.removeLetters(gone.map((each) => each.id))
    for (const letter of gone) this.letters.delete(letter.id)
    this.publish()
  }

  prune(): void {
    const gone = [...this.letters.values()].filter(
      (each) => !this.host.exists(each.terminalId) && this.now() - each.at > 24 * 60 * 60_000,
    )
    this.records.removeLetters(gone.map((each) => each.id))
    for (const letter of gone) this.letters.delete(letter.id)
  }

  async *watch(signal?: AbortSignal): AsyncGenerator<InboxLetter[]> {
    const reader = new Latest<InboxLetter[]>()
    this.readers.add(reader)
    reader.push(this.list())
    const abort = () => reader.finish()
    signal?.addEventListener("abort", abort, { once: true })
    if (this.closed || signal?.aborted) reader.finish()
    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop -- Listings are delivered in order.
        const next = await reader.next()
        if (next === undefined) return
        yield next
      }
    } finally {
      signal?.removeEventListener("abort", abort)
      reader.finish()
      this.readers.delete(reader)
    }
  }

  close(): void {
    this.closed = true
    for (const reader of this.readers) reader.finish()
    this.readers.clear()
  }
  private put(letter: Letter): void {
    this.records.saveLetter(letter)
    this.letters.set(letter.id, letter)
    this.changed(letter.terminalId)
  }
  private changed(terminalId: string): void {
    this.host.changed(terminalId)
    this.publish()
  }
  private publish(): void {
    const listing = this.list()
    const key = JSON.stringify(listing)
    for (const reader of this.readers) reader.push(listing, key)
  }
}
