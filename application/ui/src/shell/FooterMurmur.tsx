import { useEffect, useId, useState } from "react"

import type { Murmur, MurmurState } from "../model/murmur"
import { Progress } from "../ui-toolkit/Progress"
import { ProgressRing } from "../ui-toolkit/ProgressRing"
import {
  doneForMs,
  footerPhase,
  footerText,
  installPercent,
  stepText,
  type FooterPhase,
} from "./murmur-footer"

export type FooterMurmurProps = {
  readonly state: MurmurState
  readonly actions: Pick<Murmur, "install" | "cancel">
}

// Murmur's install, as a small item beside the update's: a ring and "Murmur 42%" while it
// downloads and checks, however it was started (from the one-time offer or from Addons), then
// "Terminals name themselves now" for a moment. It opens a sheet, the footer's own plain panel
// (as the update's, never taking focus), with the step and Cancel. A failure that may pass
// turns the item to the danger tone and opens the sheet once, with Try again and Not now (which
// only hides it); a computer that can't run Murmur says so there, and the item leaves with it.
// Its words are announced in one stable line, never as a percentage that changes.
export const FooterMurmur = ({
  murmur,
  hidden,
}: {
  readonly murmur: FooterMurmurProps | undefined
  readonly hidden: boolean
}): React.JSX.Element | null => {
  const state = murmur?.state
  const [phase, setPhase] = useState<FooterPhase>("idle")
  // The failure the state showed before any install here: not this install's.
  const [baseline, setBaseline] = useState<string | null>(state?.failure ?? null)
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const panelId = useId()
  const next = state ? footerPhase(phase, state, baseline) : "idle"
  if (next !== phase) {
    setPhase(next)
    // What went wrong, or can't be, is said once on its own; the rest opens when asked.
    setOpen(next === "failed" || next === "unavailable")
  }
  useEffect(() => {
    if (phase !== "done") return undefined
    const timer = setTimeout(() => setPhase("idle"), doneForMs)
    return () => clearTimeout(timer)
  }, [phase])
  if (!murmur || !state || phase === "idle") return null
  const { actions } = murmur
  const text = footerText(phase, state)
  const percent = installPercent(state)
  const tone = phase === "failed" ? "danger" : phase === "done" ? "success" : undefined
  const leave = (): void => {
    setOpen(false)
    if (phase === "unavailable" || phase === "failed") {
      setBaseline(state.failure)
      setPhase("idle")
    }
  }
  const visibleSheet = open && !hidden
  return (
    <>
      <span
        role="status"
        aria-live={phase === "failed" ? "assertive" : "polite"}
        className="sr-only"
      >
        {text.summary}
      </span>
      {!hidden && (
        <button
          type="button"
          className="footer-action footer-update footer-murmur cursor-pointer gap-1.5 font-bold"
          data-tone={tone}
          aria-label={text.summary}
          aria-expanded={visibleSheet}
          aria-controls={visibleSheet ? panelId : undefined}
          onClick={() => (visibleSheet ? leave() : setOpen(true))}
        >
          {phase === "installing" && <ProgressRing percent={percent} />}
          <span>{text.label}</span>
        </button>
      )}
      {visibleSheet && (
        <section
          id={panelId}
          data-workspace-notice
          aria-labelledby={titleId}
          className="floating update-panel"
          tabIndex={-1}
          // A click anywhere on it leaves focus where it was, in a terminal.
          onMouseDown={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.shiftKey) return
            event.preventDefault()
            event.stopPropagation()
            leave()
          }}
        >
          {phase === "installing" && (
            <>
              <p id={titleId} className="update-title">
                Setting up Murmur
              </p>
              <p className="update-text">{stepText(state)}</p>
              <Progress
                label="Murmur setup"
                value={state.installing?.received ?? 0}
                max={state.installing?.total ?? 1}
                indeterminate={state.installing === null || state.installing.step === "check"}
              />
              <div className="update-actions">
                <button type="button" className="button min-h-8 px-3" onClick={actions.cancel}>
                  Cancel
                </button>
              </div>
            </>
          )}
          {phase === "failed" && (
            <>
              <p id={titleId} className="update-title">
                Couldn't turn on Murmur
              </p>
              <p role="alert" className="update-text update-error footer-murmur-error">
                {state.failure}
              </p>
              <div className="update-actions">
                <button type="button" className="button min-h-8 px-3" onClick={leave}>
                  Not now
                </button>
                <button
                  type="button"
                  className="button primary min-h-8 px-3"
                  onClick={() => {
                    setOpen(false)
                    actions.install()
                  }}
                >
                  Try again
                </button>
              </div>
            </>
          )}
          {phase === "unavailable" && (
            <>
              <p id={titleId} className="update-title">
                Not available on this computer
              </p>
              <details className="update-text">
                <summary className="cursor-pointer select-none">Details</summary>
                <p className="m-0 mt-1 break-words">{state.unsupported}</p>
              </details>
              <div className="update-actions">
                <button type="button" className="button min-h-8 px-3" onClick={leave}>
                  Close
                </button>
              </div>
            </>
          )}
          {phase === "done" && (
            <p id={titleId} className="update-title">
              {text.label}
            </p>
          )}
        </section>
      )}
    </>
  )
}
