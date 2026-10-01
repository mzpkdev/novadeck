import { open } from "node:fs/promises"
import { setTimeout as sleep } from "node:timers/promises"

import type { Terminal as Screen } from "@xterm/headless"

import type { HarnessEvent } from "../harnesses/events.js"
import { doorbellLine, type TranscriptEntry } from "../harnesses/harness.js"
import { rootedIn, type Root } from "../harnesses/roots.js"
import { bracketedPaste, calmMs, checkPaste, freshNonce, gate } from "./ring.js"

/** A terminal's screen as the doorbell reads it: its rows' text, and its paste mode. */
export type ScreenText = { readonly rows: readonly string[]; readonly bracketedPaste: boolean }

/** How much of a transcript's end is read for its last user input, in bytes. */
const tailBytes = 256 * 1024

/**
 * The last thing the person, or the doorbell, submitted, as a transcript records it:
 * where a harness's hooks don't name a prompt's text, this tells a doorbell prompt.
 */
export const lastUserInput = async (
  path: string,
  items: (line: string) => readonly TranscriptEntry[],
): Promise<string | undefined> => {
  let text: string
  try {
    const file = await open(path, "r")
    try {
      const { size } = await file.stat()
      const start = Math.max(0, size - tailBytes)
      const buffer = Buffer.alloc(size - start)
      await file.read(buffer, 0, buffer.length, start)
      text = buffer.toString("utf8")
    } finally {
      await file.close()
    }
  } catch {
    return undefined
  }
  let last: string | undefined
  for (const line of text.split("\n"))
    for (const item of items(line))
      if (item.role === "user" && item.kind === "text") last = item.text
  return last
}

/**
 * The facts with the ring confirmed, where a harness's hooks name no prompt: a root
 * turn it started by itself is the doorbell's when the last user `input` its transcript
 * recorded holds the ring's line. Undefined when no such turn is there, or, given an
 * input, it doesn't hold the line.
 */
export const confirmRing = (
  events: readonly HarnessEvent[],
  root: Root,
  nonce: string,
  input: string | undefined,
): readonly HarnessEvent[] | undefined => {
  const index = events.findIndex(
    (event) => event.type === "turn-started" && event.cause === "harness" && rootedIn(root, event),
  )
  if (index < 0) return undefined
  // Probing whether a turn is there, before the transcript is read.
  if (input === undefined) return events
  if (!input.includes(doorbellLine(nonce))) return undefined
  return events.map((event, at) =>
    at === index && event.type === "turn-started" ? { ...event, cause: "doorbell", nonce } : event,
  )
}

/** The screen's visible rows as text, and whether it takes pastes bracketed. */
export const screenText = (screen: Screen): ScreenText => {
  const buffer = screen.buffer.active
  const rows: string[] = []
  for (let row = 0; row < screen.rows; row += 1)
    rows.push(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "")
  return { rows, bracketedPaste: screen.modes.bracketedPasteMode }
}

/** What the doorbell needs of the terminal manager and messaging, by terminal. */
export type DoorbellHost = {
  /** Whether messaging lets it ring: Settled, untouched, with messages waiting. */
  readonly ringable: (terminalId: string) => boolean
  /** Starts the ring with its nonce: the terminal is Ringing; false when it may not now. */
  readonly ring: (terminalId: string, nonce: string) => boolean
  /** The nonce of the ring under way there, if any. */
  readonly ringing: (terminalId: string) => string | undefined
  /** The ring failed: the terminal is Unknown, and its messages wait. */
  readonly ringFailed: (terminalId: string, nonce: string) => void
  /** The screen once it has drawn all pending output; undefined once the terminal is gone. */
  readonly screen: (terminalId: string) => Promise<ScreenText | undefined>
  /** Whether the bound instance holds the foreground; undefined where that can't be told. */
  readonly foreground: (terminalId: string) => Promise<boolean | undefined>
  /** Holds the person's input to the terminal until the returned release, or a second. */
  readonly hold: (terminalId: string) => () => void
  /** Writes to the terminal's shell; false once it is gone. */
  readonly write: (terminalId: string, data: string) => boolean
}

export type DoorbellOptions = {
  readonly now?: () => number
  /** How long a screen must be still before a ring, in milliseconds. */
  readonly calmMs?: number
  /** How often the screen is looked at after the test paste, in milliseconds. */
  readonly pollMs?: number
  /** How long the test paste may take to show, in milliseconds. */
  readonly pasteMs?: number
  /** How long after its Enter a ring waits for its doorbell prompt, in milliseconds. */
  readonly confirmMs?: number
}

/**
 * Wakes idle agents (see docs/agent-messaging.md, "The doorbell"): once messaging says a
 * terminal may be rung and its screen has been still for a while, it pastes the line as a
 * test, presses Enter only when the line landed alone, and lets the ring fail when no
 * doorbell prompt confirms it. It never presses a key after a failure, and knows nothing
 * of how any harness draws its screen. Each change to a terminal's screen or messages
 * looks again, coalesced per terminal per tick.
 */
export class Doorbell {
  private readonly now: () => number
  private readonly pollMs: number
  private readonly pasteMs: number
  private readonly confirmMs: number
  private readonly calmMs: number
  /** Each terminal's screen text as last seen, and since when. */
  private readonly still = new Map<string, { readonly text: string; readonly since: number }>()
  private readonly scheduled = new Set<string>()
  private readonly checking = new Set<string>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private closed = false

  constructor(
    private readonly host: DoorbellHost,
    options: DoorbellOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.pollMs = options.pollMs ?? 50
    this.pasteMs = options.pasteMs ?? 500
    this.confirmMs = options.confirmMs ?? 5_000
    this.calmMs = options.calmMs ?? calmMs
  }

  /** The terminal's screen or messages changed: it is looked at again, once this tick. */
  changed(terminalId: string): void {
    if (this.closed || this.scheduled.has(terminalId)) return
    this.scheduled.add(terminalId)
    setImmediate(() => {
      this.scheduled.delete(terminalId)
      void this.check(terminalId).catch((error: unknown) =>
        console.error("NovaDeck's doorbell failed:", error),
      )
    })
  }

  /** Forgets a terminal that stopped running. */
  forget(terminalId: string): void {
    clearTimeout(this.timers.get(terminalId))
    this.timers.delete(terminalId)
    this.still.delete(terminalId)
  }

  close(): void {
    this.closed = true
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private later(terminalId: string, ms: number): void {
    clearTimeout(this.timers.get(terminalId))
    const timer = setTimeout(() => {
      this.timers.delete(terminalId)
      this.changed(terminalId)
    }, ms)
    timer.unref()
    this.timers.set(terminalId, timer)
  }

  private async check(terminalId: string): Promise<void> {
    if (this.closed || this.checking.has(terminalId) || !this.host.ringable(terminalId)) return
    this.checking.add(terminalId)
    try {
      const screen = await this.host.screen(terminalId)
      if (!screen) return
      const text = screen.rows.join("\n")
      const now = this.now()
      let still = this.still.get(terminalId)
      if (still?.text !== text) {
        still = { text, since: now }
        this.still.set(terminalId, still)
      }
      const calm = now - still.since
      if (calm < this.calmMs) return this.later(terminalId, this.calmMs - calm)
      const foreground = await this.host.foreground(terminalId)
      const verdict = gate(
        {
          ringable: this.host.ringable(terminalId),
          calmMs: calm,
          bracketedPaste: screen.bracketedPaste,
          foreground,
        },
        this.calmMs,
      )
      if (verdict === "open") await this.ring(terminalId)
    } finally {
      this.checking.delete(terminalId)
    }
  }

  /**
   * Rings once: the test paste, with the person's input held; Enter only once the line
   * shows alone, twice running; then a wait for its doorbell prompt.
   */
  private async ring(terminalId: string): Promise<void> {
    const nonce = freshNonce()
    const line = doorbellLine(nonce)
    if (!this.host.ring(terminalId, nonce)) return
    const release = this.host.hold(terminalId)
    let pressed = false
    try {
      const before = await this.host.screen(terminalId)
      if (before && this.host.write(terminalId, bracketedPaste(line))) {
        const until = this.now() + this.pasteMs
        let landed: string | undefined
        while (this.host.ringing(terminalId) === nonce) {
          // eslint-disable-next-line no-await-in-loop -- The screen is looked at in turn.
          await sleep(this.pollMs)
          // eslint-disable-next-line no-await-in-loop -- As above.
          const after = await this.host.screen(terminalId)
          if (!after) break
          const text = after.rows.join("\n")
          const accepted = checkPaste(before.rows, after.rows, line).accepted
          // Accepted twice running on the same screen, so it isn't caught mid-draw.
          if (accepted && landed === text) {
            pressed = this.host.ringing(terminalId) === nonce && this.host.write(terminalId, "\r")
            break
          }
          landed = accepted ? text : undefined
          if (this.now() >= until) break
        }
      }
    } finally {
      release()
    }
    if (!pressed) {
      this.host.ringFailed(terminalId, nonce)
      return
    }
    const timer = setTimeout(() => {
      if (this.host.ringing(terminalId) === nonce) this.host.ringFailed(terminalId, nonce)
    }, this.confirmMs)
    timer.unref()
  }
}
