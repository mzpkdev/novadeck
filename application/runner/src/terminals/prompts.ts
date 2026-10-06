import { setTimeout as sleep } from "node:timers/promises"

import { DomainError } from "../errors.js"
import type { ScreenText } from "./doorbell.js"
import { bracketedPaste, checkPaste, findLine } from "./ring.js"

/** What prompts need of the terminal manager and messaging, by terminal. */
export type PromptHost = {
  /**
   * Throws what refuses a prompt now: `TERMINAL_NOT_FOUND` or `TERMINAL_EXITED`, and
   * `CONFLICT` where no agent is there to take it (none bound, nor its own empty prompt
   * shown before its first session binds), or one waits on the person's answer, whose
   * dialog would take the text.
   */
  readonly admit: (terminalId: string) => void
  /** The nonce of the doorbell ring under way there, if any. */
  readonly ringing: (terminalId: string) => string | undefined
  /** Whether it is Ready: a session at its own prompt before its first turn, its box empty. */
  readonly ready: (terminalId: string) => boolean
  /**
   * Whether its agent's turn runs, which the person's text queues behind or steers, and
   * whose spinner redraws the screen all the while.
   */
  readonly working: (terminalId: string) => boolean
  /** The screen once it has drawn all pending output; undefined once the terminal is gone. */
  readonly screen: (terminalId: string) => Promise<ScreenText | undefined>
  /**
   * Holds the person's input to the terminal for at most `capMs`, and its window's
   * resizes until `settle`, which releases the input too. `holding` says the input is
   * still held.
   */
  readonly hold: (
    terminalId: string,
    capMs: number,
  ) => {
    readonly release: () => void
    readonly settle: () => void
    readonly holding: () => boolean
  }
  /**
   * Writes keys to the agent as the person's, through the bookkeeping their own keys get,
   * ahead of anything their held input waits to send; false once the terminal is gone.
   */
  readonly type: (terminalId: string, data: string) => boolean
}

export type PromptOptions = {
  /** How often the screen is looked at after the paste, in milliseconds. */
  readonly pollMs?: number
  /** How long the paste may take to show, in milliseconds. */
  readonly pasteMs?: number
  /** How long a doorbell ring under way is waited for, in milliseconds. */
  readonly ringMs?: number
  /** How long after its Enter the window's resizes stay held, in milliseconds. */
  readonly settleMs?: number
}

/**
 * Whether a TUI may show a paste as a placeholder (Claude Code's "[Pasted text #1 +4
 * lines]") rather than its text: more than one line, or long.
 */
export const collapsible = (text: string): boolean => /[\r\n]/.test(text) || text.length > 200

/**
 * Whether the text shows once on the screen and didn't before. At a Ready prompt, where
 * its box is known empty, and while a turn runs, that is enough to say it landed in the
 * box, however the TUI redraws around it: Codex's welcome screen goes whole, and its box
 * moves up; a spinner and its timers change rows all the while.
 */
const alone = (before: readonly string[], after: readonly string[], text: string): boolean =>
  findLine(before, text).length === 0 && findLine(after, text).length === 1

/** A prompt's lines as a terminal takes them in a paste: its line breaks are bare returns. */
const pasted = (text: string): string => text.replace(/\r\n?|\n/g, "\r")

/**
 * Gives agents prompts as the person would (see docs/backend-api.md, `agents.prompt`): the
 * text as one bracketed paste with the person's keys held, then Enter once the paste
 * shows and the screen is still, both through the same bookkeeping the person's keys get.
 * It never presses Enter after a failed check: the text stays as a draft. Prompts to one
 * terminal go one at a time, and wait for a doorbell ring under way, so the two never
 * share a box. Knows nothing of how any harness draws its screen.
 */
export class Prompts {
  private readonly pollMs: number
  private readonly pasteMs: number
  private readonly ringMs: number
  private readonly settleMs: number
  /** The latest prompt of each terminal that is not yet done. */
  private readonly tails = new Map<string, Promise<void>>()
  /** Lets go of the resizes each terminal's latest prompt holds, until they lapse. */
  private readonly settles = new Map<string, () => void>()

  constructor(
    private readonly host: PromptHost,
    options: PromptOptions = {},
  ) {
    this.pollMs = options.pollMs ?? 50
    this.pasteMs = options.pasteMs ?? 5_000
    this.ringMs = options.ringMs ?? 10_000
    this.settleMs = options.settleMs ?? 1_000
  }

  /**
   * Gives the terminal's agent `text` as a prompt, once those before it are done. Refuses
   * as `admit` says, with `CONFLICT` too where the screen takes no bracketed paste;
   * `PROMPT_FAILED` where the paste never showed, leaving what landed of it as a draft.
   */
  async prompt(terminalId: string, text: string): Promise<void> {
    this.host.admit(terminalId)
    const previous = this.tails.get(terminalId) ?? Promise.resolve()
    const run = previous.then(() => this.send(terminalId, text))
    const tail = run.then(
      () => {},
      () => {},
    )
    this.tails.set(terminalId, tail)
    void tail.then(() => {
      if (this.tails.get(terminalId) === tail) this.tails.delete(terminalId)
    })
    return await run
  }

  private async send(terminalId: string, text: string): Promise<void> {
    await this.ringDone(terminalId)
    this.host.admit(terminalId)
    const before = await this.host.screen(terminalId)
    if (!before) throw new DomainError("TERMINAL_NOT_FOUND")
    if (!before.bracketedPaste)
      throw new DomainError("CONFLICT", "The agent's screen takes no bracketed paste.")
    // Asked before the paste, which the person's own keys make a draft.
    const vanish = this.host.ready(terminalId)
    const working = this.host.working(terminalId)
    const hold = await this.held(terminalId)
    let pressed = false
    try {
      // A person's paste, whose line breaks the TUI takes as text, never as Enter.
      if (!this.host.type(terminalId, bracketedPaste(pasted(text)))) throw this.failed()
      pressed = await this.landed(terminalId, text, before, { vanish, working }, hold.holding)
      // Their keys wait until the Enter is out, so none comes between the paste and it.
      if (pressed) this.host.type(terminalId, "\r")
    } finally {
      hold.release()
    }
    if (!pressed) {
      hold.settle()
      throw this.failed()
    }
    // A resize as the turn starts may crash a TUI, as the doorbell's ring found of Codex.
    // The next prompt there needs no wait for it.
    const timer = setTimeout(() => this.settle(terminalId), this.settleMs)
    timer.unref()
    this.settles.set(terminalId, () => {
      clearTimeout(timer)
      hold.settle()
    })
  }

  /** Lets go of the window's resizes held after the last prompt's Enter, if any still are. */
  private settle(terminalId: string): void {
    const settle = this.settles.get(terminalId)
    this.settles.delete(terminalId)
    settle?.()
  }

  /**
   * The person's input held for the paste's time and a margin, as long text takes longer
   * to draw. A hold in force is the doorbell's ring waiting for its prompt, which a prompt
   * waits out for as long as it does a ring.
   */
  private async held(terminalId: string): Promise<ReturnType<PromptHost["hold"]>> {
    this.settle(terminalId)
    const until = Date.now() + this.ringMs
    for (;;) {
      const hold = this.host.hold(terminalId, this.pasteMs + 2_000)
      if (hold.holding()) return hold
      if (Date.now() >= until)
        throw new DomainError("CONFLICT", "A message's doorbell is ringing the agent.")
      // eslint-disable-next-line no-await-in-loop -- The hold is tried in turn.
      await sleep(this.pollMs)
      this.host.admit(terminalId)
    }
  }

  private failed(): DomainError {
    return new DomainError("PROMPT_FAILED", "The prompt did not show in the agent's input box.")
  }

  /** Waits for the ring under way, if any, to end; a ring that outlasts it is a conflict. */
  private async ringDone(terminalId: string): Promise<void> {
    const until = Date.now() + this.ringMs
    while (this.host.ringing(terminalId) !== undefined) {
      if (Date.now() >= until)
        throw new DomainError("CONFLICT", "A message's doorbell is ringing the agent.")
      // eslint-disable-next-line no-await-in-loop -- The ring is looked at in turn.
      await sleep(this.pollMs)
    }
  }

  /**
   * Whether the pasted text showed in time, and the screen held still: a short line as the
   * doorbell's check takes it, twice running on the same screen; text a TUI may collapse
   * when the screen changed and showed the same on two reads running. While a turn runs,
   * its spinner redraws the screen all the while: the line landing alone on two reads.
   */
  private async landed(
    terminalId: string,
    text: string,
    before: ScreenText,
    { vanish, working }: { readonly vanish: boolean; readonly working: boolean },
    holding: () => boolean,
  ): Promise<boolean> {
    const shown = before.rows.join("\n")
    const until = Date.now() + this.pasteMs
    let last: string | undefined
    let accepted = false
    while (Date.now() < until && holding()) {
      // eslint-disable-next-line no-await-in-loop -- The screen is looked at in turn.
      await sleep(this.pollMs)
      // eslint-disable-next-line no-await-in-loop -- As above.
      const after = await this.host.screen(terminalId)
      if (!after) return false
      const now = after.rows.join("\n")
      const steady = now === last
      const lands =
        checkPaste(before.rows, after.rows, text, { vanish }).accepted ||
        ((vanish || working) && alone(before.rows, after.rows, text))
      // A running turn's spinner never lets the whole screen hold still.
      if (lands && accepted && (steady || working)) return holding()
      // A TUI that shows a placeholder for it changed its screen, then held it still.
      if (collapsible(text) && steady && now !== shown) return holding()
      accepted = lands
      last = now
    }
    return false
  }
}
