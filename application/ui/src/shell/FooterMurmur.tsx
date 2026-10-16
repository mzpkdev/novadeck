import { useEffect, useId, useRef, useState } from "react"

import { MURMUR_NAME, type Murmur, type MurmurState } from "../model/murmur"
import { Progress } from "../ui-toolkit/Progress"
import { ProgressRing } from "../ui-toolkit/ProgressRing"
import { useOverlayOpen } from "./FooterUpdate"
import {
  doneForMs,
  footerPhase,
  footerText,
  installPercent,
  isSnapshot,
  stepText,
  type FooterPhase,
} from "./murmur-footer"

export type FooterMurmurProps = {
  readonly state: MurmurState
  readonly actions: Pick<Murmur, "install" | "cancel">
  // A dialog, the switcher or a question holds the sheet back until it is answered, as it
  // holds the update's notice.
  readonly blocked: boolean
}

// Murmur's install, as a small item beside the update's: a ring and "Murmur 42%" while it
// downloads and checks, however it was started (from the one-time offer or from Addons), then
// "Terminals name themselves now" for a moment. An engine update the app starts by itself shows
// nothing. It opens a sheet, the footer's own plain panel (as the update's: it waits while the
// footer is hidden, a dialog or a menu is open), with the step and Cancel. A failure that may
// pass turns the item to the danger tone and opens the sheet once, with Try again and Not now
// (which only hides it); a computer that can't run Murmur says so there, and the item leaves
// with it. Its words are announced in one live line that is there before it has words, and a
// failure is said once, never as a percentage that changes.
export const FooterMurmur = ({
  murmur,
  hidden,
}: {
  readonly murmur: FooterMurmurProps | undefined
  readonly hidden: boolean
}): React.JSX.Element | null => {
  const state = murmur?.state
  const [phase, setPhase] = useState<FooterPhase>("idle")
  // The failure the runner's first snapshot showed, a past run's, which is not this install's;
  // undefined until that snapshot has come.
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const chip = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  // Whether the person opened the sheet by pressing the item: it then takes focus, so Esc closes it.
  const asked = useRef(false)
  const titleId = useId()
  const panelId = useId()
  if (state && baseline === undefined && isSnapshot(state)) setBaseline(state.failure)
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
  const wanted = open && !hidden && !murmur?.blocked
  const overlay = useOverlayOpen(wanted)
  const visibleSheet = wanted && !overlay
  useEffect(() => {
    if (!visibleSheet || !asked.current) return undefined
    // A frame on, after the press that asked has been through the workspace's own click handling.
    const frame = requestAnimationFrame(() => {
      asked.current = false
      panel.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [visibleSheet])
  if (!murmur || !state) return null
  const shown = phase !== "idle"
  const { actions } = murmur
  const text = shown ? footerText(phase, state) : undefined
  const percent = installPercent(state)
  const tone = phase === "failed" ? "danger" : phase === "done" ? "success" : undefined
  const leave = (): void => {
    const inside = panel.current?.contains(document.activeElement) === true
    asked.current = false
    setOpen(false)
    if (phase === "unavailable" || phase === "failed") {
      setBaseline(state.failure)
      setPhase("idle")
    }
    if (inside) chip.current?.focus()
  }
  return (
    <>
      {/* There before it has words, so what fills it is announced; a failure is said here
          alone, not again by its sheet. */}
      <span
        role="status"
        aria-live={phase === "failed" ? "assertive" : "polite"}
        className="sr-only"
      >
        {text?.summary}
      </span>
      {shown && text && !hidden && (
        <button
          ref={chip}
          type="button"
          className="footer-action footer-update footer-murmur cursor-pointer gap-1.5 font-bold"
          data-tone={tone}
          // Named by its visible words, so what is read is what is seen (the live line says
          // it once in full).
          aria-expanded={visibleSheet}
          aria-controls={visibleSheet ? panelId : undefined}
          onClick={() => {
            if (visibleSheet) return leave()
            asked.current = true
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.shiftKey || !visibleSheet) return
            event.preventDefault()
            event.stopPropagation()
            leave()
          }}
        >
          {phase === "installing" && <ProgressRing percent={percent} />}
          <span>{text.label}</span>
        </button>
      )}
      {shown && visibleSheet && (
        <section
          ref={panel}
          id={panelId}
          data-workspace-notice
          aria-labelledby={titleId}
          className="floating update-panel footer-murmur-sheet"
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
                Setting up {MURMUR_NAME}
              </p>
              <p className="update-text">{stepText(state)}</p>
              <Progress
                label={`${MURMUR_NAME} setup`}
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
                Couldn't turn on {MURMUR_NAME}
              </p>
              <p className="update-text update-error footer-murmur-error">{state.failure}</p>
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
              {text?.label}
            </p>
          )}
        </section>
      )}
    </>
  )
}
