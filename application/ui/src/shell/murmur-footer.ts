import {
  isInstallFailure,
  isRefusedInstall,
  MURMUR_NAME,
  murmurStepTitles,
  type MurmurState,
} from "../model/murmur"
import { formatSize } from "../model/voice-format"

// What Murmur's footer item shows, as a plain function of the addon's state: an install's
// progress as it goes, then how it ended. Only an install seen from here (started in this
// run of the app, from the offer or from Addons) shows; what the runner said at the start,
// such as a check that never passed, is Addons' to say.

export type FooterPhase = "idle" | "installing" | "done" | "failed" | "unavailable"

// How long "Terminals name themselves now" stays.
export const doneForMs = 4000

// Whether the runner has said how it is: the placeholder before its first snapshot has no
// download sizes.
export const isSnapshot = (state: MurmurState): boolean => state.sizes.model > 0

// Where the item stands after `state`, given where it stood. `baseline` is the failure the
// runner's first snapshot showed (a past run's), which is not an install's; before that
// snapshot (`undefined`) nothing is judged. The engine's own update, which the runner says it
// is running, shows nothing, and the refusal of another call (a decline that did not save, an
// uninstall or a cancel) is not an install's failure. A cancel is no failure at all: the runner
// leaves the files with the check owed (`unchecked`) and no failure.
export const footerPhase = (
  phase: FooterPhase,
  state: MurmurState,
  baseline: string | null | undefined,
  // The verdict that stood as the install began (a Check again keeps it until the new check
  // ends): only another is news of it.
  verdictBefore: string | null = null,
): FooterPhase => {
  if (baseline === undefined) return phase
  const failure = state.failure !== null && isInstallFailure(state.failure) ? state.failure : null
  if (state.installing)
    return phase === "installing" || !state.installing.engineOnly ? "installing" : phase
  if (phase === "installing") {
    // It ended: how, is for the state to say.
    if (state.unsupported !== null && state.unsupported !== verdictBefore) return "unavailable"
    if (failure !== null) return "failed"
    return state.installed && state.check !== null ? "done" : "idle"
  }
  if (phase === "idle")
    // Only an install this app asked for shows from rest: one the runner turned away. What
    // the runner reports of itself (a device that went away, an engine update that failed) is
    // Addons'.
    return failure !== null && isRefusedInstall(failure) && failure !== baseline ? "failed" : "idle"
  if (phase === "failed" && failure === null) return "idle"
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
    return {
      label: `${MURMUR_NAME} \u00b7 failed`,
      summary: `${MURMUR_NAME} couldn't turn on${state.failure ? `. ${state.failure}` : ""}`,
    }
  if (phase === "unavailable")
    return {
      label: `${MURMUR_NAME} isn't available`,
      summary: `${MURMUR_NAME} isn't available on this computer`,
    }
  const percent = installPercent(state)
  return {
    label: percent === null ? MURMUR_NAME : `${MURMUR_NAME} ${percent}%`,
    summary: `Setting up ${MURMUR_NAME}`,
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
