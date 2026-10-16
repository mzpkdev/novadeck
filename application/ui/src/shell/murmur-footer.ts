import { murmurStepTitles, type MurmurState } from "../model/murmur"
import { formatSize } from "../model/voice-format"

// What Murmur's footer item shows, as a plain function of the addon's state: an install's
// progress as it goes, then how it ended. Only an install seen from here (started in this
// run of the app, from the offer or from Addons) shows; what the runner said at the start,
// such as a check that never passed, is Addons' to say.

export type FooterPhase = "idle" | "installing" | "done" | "failed" | "unavailable"

// How long "Terminals name themselves now" stays.
export const doneForMs = 4000

// Where the item stands after `state`, given where it stood. `baseline` is the failure the
// state showed when the app started, which is not an install's.
export const footerPhase = (
  phase: FooterPhase,
  state: MurmurState,
  baseline: string | null,
): FooterPhase => {
  if (state.installing) return "installing"
  if (phase === "installing") {
    // It ended: how, is for the state to say.
    if (state.unsupported !== null) return "unavailable"
    if (state.failure !== null) return "failed"
    return state.installed && state.check !== null ? "done" : "idle"
  }
  if (phase === "idle")
    // A call that failed before an install began, as a refused install, is shown too.
    return state.failure !== null &&
      state.failure !== baseline &&
      (!state.installed || state.check === null)
      ? "failed"
      : "idle"
  if (phase === "failed" && state.failure === null) return "idle"
  return phase
}

// The share of the whole download that has arrived, 0 to 100, or null while there is nothing
// to count (the check).
export const installPercent = (state: MurmurState): number | null => {
  const { installing, sizes } = state
  if (!installing || installing.step === "check") return null
  const total = sizes.engine + sizes.model
  if (total <= 0) return 0
  const before = installing.step === "model" ? sizes.engine : 0
  return Math.min(100, Math.round(((before + installing.received) / total) * 100))
}

// The item's words, for sighted and assistive technology alike. `summary` is the stable
// one a live region says; the label may carry a percentage that changes.
export const footerText = (
  phase: Exclude<FooterPhase, "idle">,
  state: MurmurState,
): { readonly label: string; readonly summary: string } => {
  if (phase === "done")
    return { label: "Terminals name themselves now", summary: "Terminals name themselves now" }
  if (phase === "failed")
    return { label: "Murmur couldn't turn on", summary: "Murmur couldn't turn on" }
  if (phase === "unavailable")
    return { label: "Murmur isn't available", summary: "Murmur isn't available on this computer" }
  const percent = installPercent(state)
  return {
    label: percent === null ? "Murmur" : `Murmur ${percent}%`,
    summary: "Setting up Murmur",
  }
}

// What the open sheet says of the step under way.
export const stepText = ({ installing }: MurmurState): string => {
  if (!installing) return "Starting…"
  const title = murmurStepTitles[installing.step]
  return installing.step === "check"
    ? title
    : `${title} · ${formatSize(installing.received)} of ${formatSize(installing.total)}`
}
