import type { DeliveryState } from "@novadeck/protocol"

/**
 * How a terminal's agent can take a message now, one state machine per terminal (see
 * docs/agent-messaging.md, "States"). Every terminal with an agent is in one state at
 * all times, derived from what its harness and its person did, so the prompt's emptiness
 * is known before any message arrives. Step one has no doorbell: a Settled terminal waits
 * for its next root prompt, as a Person busy or Unknown one does.
 */
export type Delivery = {
  readonly state: DeliveryState
  /**
   * Whether the prompt is known empty: since the session bound or the person's last
   * root prompt, the person typed nothing there, apart from answers to a request.
   */
  readonly empty: boolean
  /** Whether the person submitted a prompt during the current turn, which their harness queues. */
  readonly submitted: boolean
  /** How many of the current turn's Stops NovaDeck continued with messages. */
  readonly continued: number
}

/** NovaDeck continues a root turn at most this often, by its own count, then lets it end. */
export const maxContinuations = 2

/**
 * What changes a terminal's delivery:
 * - `bound`: a session binds, or its harness announced a new one;
 * - `unbound`: the binding ended, as its instance exited;
 * - `prompt`: a root turn started: the person's prompt, one the harness started by
 *   itself (a background task's result), or a later model call of a running turn;
 * - `stop`: a normal root Stop, which NovaDeck `continued` or not, with work the turn
 *   started still running in the `background`;
 * - `ended`: a root turn ended abnormally: an Esc, a denial, a failure;
 * - `input`: the person's input, which `submits` a prompt (Enter, or Codex's Tab), unless
 *   it `answers` a pending request.
 */
export type DeliveryEvent =
  | { readonly type: "bound" }
  | { readonly type: "unbound" }
  | { readonly type: "prompt"; readonly by: "person" | "harness" | "call" }
  | { readonly type: "stop"; readonly continued: boolean; readonly background: boolean }
  | { readonly type: "ended" }
  | { readonly type: "input"; readonly submits: boolean; readonly answers: boolean }

export const unbound: Delivery = { state: "unbound", empty: false, submitted: false, continued: 0 }

/** A freshly bound session, whose prompt is empty until the person types. */
const fresh: Delivery = { state: "fresh", empty: true, submitted: false, continued: 0 }

/** Whether a Stop may end a turn here: one running, or one whose start went unseen. */
const stoppable = (state: DeliveryState): boolean =>
  state === "working" || state === "unknown" || state === "fresh"

/** The delivery after an event; the same delivery when it changes nothing. */
export const transition = (delivery: Delivery, event: DeliveryEvent): Delivery => {
  if (event.type === "bound") return fresh
  if (event.type === "unbound") return unbound
  if (delivery.state === "unbound") return delivery
  switch (event.type) {
    case "prompt": {
      // A later call of the same turn, or a turn continued, keeps its count.
      const running = delivery.state === "working"
      if (event.by === "call" && running) return delivery
      return {
        state: "working",
        // Only the person's own prompt says the prompt is empty again.
        empty: event.by === "person" ? true : delivery.empty,
        submitted: running ? delivery.submitted : false,
        continued: running ? delivery.continued : 0,
      }
    }
    case "stop": {
      if (!stoppable(delivery.state)) return delivery
      if (event.continued)
        return { ...delivery, state: "working", continued: delivery.continued + 1 }
      // What the turn started still runs, and may start another turn by itself.
      if (event.background) return { ...delivery, state: "working", continued: 0 }
      const settled = delivery.empty && !delivery.submitted
      return { ...delivery, state: settled ? "settled" : "busy", submitted: false, continued: 0 }
    }
    case "ended":
      return { ...delivery, state: "unknown", submitted: false, continued: 0 }
    case "input": {
      // Keys sent while a request waits answer it; they are no draft.
      if (event.answers) return delivery
      return {
        ...delivery,
        state: delivery.state === "settled" ? "busy" : delivery.state,
        empty: false,
        submitted: delivery.submitted || (delivery.state === "working" && event.submits),
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
      return codex ? "at its turn's end or its next prompt" : "when its current turn ends"
    default:
      return "when the person next submits a prompt there"
  }
}
