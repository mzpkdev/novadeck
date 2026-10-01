import type { DeliveryState } from "@novadeck/protocol"

/**
 * How a terminal's agent can take a message now, one state machine per terminal (see
 * docs/agent-messaging.md, "States"). Every terminal with an agent is in one state at
 * all times, derived from what its harness and its person did, so the prompt's emptiness
 * is known before any message arrives. Step one has no doorbell: a Settled terminal waits
 * for its next root prompt, as a Person busy or Unknown one does.
 *
 * Working covers two cases: a root turn running, and only work a turn started still
 * running in the background (Claude Code's background tasks, Antigravity's subagents)
 * after its Stop. Only while a root turn runs is the person's Enter a prompt their
 * harness queues; otherwise it submits one at once.
 */
export type Delivery = {
  readonly state: DeliveryState
  /** Whether a root turn runs, rather than only work an ended turn left in the background. */
  readonly running: boolean
  /**
   * Whether the prompt is known empty: since the session bound or the person's last
   * root prompt, the person typed nothing there, apart from answers to a request.
   */
  readonly empty: boolean
  /** Whether the person submitted a prompt during the running turn, which their harness queues. */
  readonly submitted: boolean
  /** How many of the current turn's Stops NovaDeck continued with messages. */
  readonly continued: number
  /**
   * Whether the latest root event of the turn was its Stop: an idle status line after it
   * says nothing new, and a prompt after a Stop NovaDeck continued is its continuation.
   */
  readonly stopped: boolean
  /** Counts root turns, so what was leased in one never acts on a later one. */
  readonly turn: number
}

/** NovaDeck continues a root turn at most this often, by its own count, then lets it end. */
export const maxContinuations = 2

/**
 * What changes a terminal's delivery:
 * - `bound`: a session binds, or its harness announced a new one;
 * - `unbound`: the binding ended, as its instance exited;
 * - `prompt`: a root turn started: the person's prompt, one the harness started by
 *   itself (a background task's result, or any Antigravity turn, whose hooks can't tell),
 *   or a later model call of a running turn;
 * - `stop`: a normal root Stop, which NovaDeck `continued` or not, with work the turn
 *   started still running in the `background`;
 * - `ended`: a root turn ended abnormally: an Esc, a denial, a failure;
 * - `idle`: the agent shows idle however its turn ended, with work still running in the
 *   `background` or not, as Antigravity's status line does;
 * - `input`: the person's input, which `submits` a prompt (Enter, or Codex's Tab), unless
 *   it `answers` a pending request.
 */
export type DeliveryEvent =
  | { readonly type: "bound" }
  | { readonly type: "unbound" }
  | { readonly type: "prompt"; readonly by: "person" | "harness" | "call" }
  | { readonly type: "stop"; readonly continued: boolean; readonly background: boolean }
  | { readonly type: "ended" }
  | { readonly type: "idle"; readonly background: boolean }
  | { readonly type: "input"; readonly submits: boolean; readonly answers: boolean }

const quiet = { running: false, submitted: false, continued: 0, stopped: false }

export const unbound: Delivery = { state: "unbound", ...quiet, empty: false, turn: 0 }

/** Whether a Stop may end a turn here: one running, or one whose start went unseen. */
const stoppable = (state: DeliveryState): boolean =>
  state === "working" || state === "unknown" || state === "fresh"

/** A turn ended normally: Settled with the prompt known empty, else the person busy. */
const ended = (delivery: Delivery): Delivery => ({
  ...delivery,
  ...quiet,
  state: delivery.empty && !delivery.submitted ? "settled" : "busy",
})

/** The delivery after an event; the same delivery when it changes nothing. */
export const transition = (delivery: Delivery, event: DeliveryEvent): Delivery => {
  if (event.type === "bound")
    return { state: "fresh", ...quiet, empty: true, turn: delivery.turn + 1 }
  if (event.type === "unbound") return { ...unbound, turn: delivery.turn + 1 }
  if (delivery.state === "unbound") return delivery
  switch (event.type) {
    case "prompt": {
      // A later call of the running turn changes nothing, nor ends the wait for the
      // continuation of a Stop NovaDeck continued: a status line saying working can come
      // before the continuation's first model call.
      if (event.by === "call" && delivery.running) return delivery
      // A prompt right after a Stop NovaDeck continued is that continuation: the same
      // turn, with its count, as Antigravity starts its model calls again from the first.
      const continuation = delivery.running && delivery.stopped
      // The person's own prompt says the prompt is empty again, and is the one they
      // submitted, so nothing of theirs is queued any more.
      const person = event.by === "person"
      if (continuation)
        return { ...delivery, stopped: false, ...(person && { empty: true, submitted: false }) }
      // A call while no turn ran (as a status line saying working after an idle one)
      // resumes the turn it belongs to, with its counts.
      if (event.by === "call")
        return { ...delivery, state: "working", running: true, stopped: false }
      return {
        state: "working",
        running: true,
        empty: person ? true : delivery.empty,
        submitted: false,
        continued: 0,
        stopped: false,
        turn: delivery.turn + 1,
      }
    }
    case "stop": {
      if (!stoppable(delivery.state)) return delivery
      if (event.continued)
        return {
          ...delivery,
          state: "working",
          running: true,
          continued: delivery.continued + 1,
          stopped: true,
        }
      // What the turn started still runs, and may start another turn by itself.
      if (event.background)
        return {
          ...delivery,
          ...quiet,
          state: "working",
          empty: delivery.empty && !delivery.submitted,
          stopped: true,
        }
      return ended(delivery)
    }
    case "ended":
      // The turn's counts stay, as a Stop that raced this end is still that turn's.
      return { ...delivery, state: "unknown", running: false, stopped: false }
    case "idle": {
      if (delivery.state !== "working") return delivery
      // Its background work finished: the turn it ran after is over.
      if (!delivery.running) return event.background ? delivery : ended(delivery)
      // After the turn's Stop, idle says nothing new; otherwise the turn ended without
      // one, keeping its counts for a Stop that arrives late.
      if (delivery.stopped) return delivery
      return { ...delivery, state: "unknown", running: false }
    }
    case "input": {
      // Keys sent while a request waits answer it; they are no draft.
      if (event.answers) return delivery
      return {
        ...delivery,
        state: delivery.state === "settled" ? "busy" : delivery.state,
        empty: false,
        // Only while a root turn runs does the harness queue what the person submits.
        submitted: delivery.submitted || (delivery.running && event.submits),
      }
    }
  }
}

/**
 * Whether a root Stop's hook may continue the turn with messages: the turn runs, the
 * person queued no prompt of their own during it, and NovaDeck has not yet continued it
 * as often as it may.
 */
export const continues = (delivery: Delivery): boolean =>
  stoppable(delivery.state) && !delivery.submitted && delivery.continued < maxContinuations

/**
 * When a message sent now would reach the agent, in the words `send` answers with.
 * Codex sends nothing when a turn fails, so its turn may only end with its next prompt.
 */
export const route = (delivery: Delivery, codex: boolean): string => {
  switch (delivery.state) {
    case "fresh":
      return "when its agent first prompts"
    case "working":
      if (!delivery.running) return "when its next turn starts"
      return codex ? "at its turn's end or its next prompt" : "when its current turn ends"
    default:
      return "when the person next submits a prompt there"
  }
}
