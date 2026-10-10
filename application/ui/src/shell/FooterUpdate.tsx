import { useEffect, useId, useRef, useState } from "react"

import { updateKey, type UpdateOffer } from "../model/update"

// The release-note lines the notice shows; the release page has the rest.
export const shownNotes = 5

// What the notice says of an offer.
const headline = ({ kind, version }: UpdateOffer): string =>
  `Novadeck ${version} is ${kind === "ready" ? "ready" : "available"}`

export type FooterUpdateProps = {
  readonly offer: UpdateOffer
  // Whether the notice is raised: it shows only while the footer does, and while nothing
  // else asks for the person's attention (`blocked`).
  readonly open: boolean
  readonly blocked: boolean
  readonly onOpenChange: (open: boolean) => void
  // Called with the offer's `updateKey` when the notice comes up.
  readonly onShown: (key: string) => void
  // Restarts into a downloaded update.
  readonly onInstall: () => void
  // Opens the update's release page.
  readonly onOpenPage: () => void
  // Puts typing focus back in the selected terminal.
  readonly returnFocus: () => void
}

// Where focus goes when a notice closes with focus inside it.
type Return = "origin" | "terminal"

// The notice's content: the headline, a few notes, and what the person can do.
const UpdateCard = ({
  offer,
  titleId,
  onClose,
  onRestart,
  onOpenPage,
}: {
  readonly offer: UpdateOffer
  readonly titleId: string
  readonly onClose: (to: Return) => void
  readonly onRestart: () => void
  readonly onOpenPage: () => void
}): React.JSX.Element => {
  const { kind, notes } = offer
  const more = notes.length - shownNotes
  return (
    <>
      <p id={titleId} className="update-title">
        {headline(offer)}
      </p>
      {notes.length > 0 && (
        <ul className="update-notes">
          {notes.slice(0, shownNotes).map((note, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- Lines may repeat; the list never reorders.
            <li key={index} title={note}>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="update-more">and {more} more</p>}
      {kind === "ready" && (
        <button type="button" className="button link update-link" onClick={onOpenPage}>
          Release notes
        </button>
      )}
      <div className="update-actions">
        <button type="button" className="button min-h-8 px-3" onClick={() => onClose("origin")}>
          Later
        </button>
        <button
          type="button"
          className="button primary min-h-8 px-3"
          onClick={() => {
            onClose("terminal")
            if (kind === "ready") onRestart()
            else onOpenPage()
          }}
        >
          {kind === "ready" ? "Restart now" : "Download"}
        </button>
      </div>
    </>
  )
}

// An update waiting beside the footer's status: a chip, "Update ready" or "Update
// available", and the notice above it. The notice is a plain panel, not a dialog or a
// layer: nothing about it intercepts keys, focus or clicks elsewhere, so typing in a
// terminal goes on. Raised once per offer, it waits while the footer is hidden or a
// dialog is open, and never takes focus by itself. The chip opens it as the person's
// own request, with focus moving in, so Escape there closes it and returns to the chip.
export const FooterUpdate = ({
  update,
  hidden,
}: {
  readonly update: FooterUpdateProps | undefined
  readonly hidden: boolean
}): React.JSX.Element => {
  // The version the person pressed Restart for: a newer one is a new offer, not pending.
  const [pressed, setPressed] = useState<string>()
  const panel = useRef<HTMLElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  // Whether the person opened the notice from the chip: focus moves into it once it
  // shows (`requested`), and closing it sends focus back to the chip (`opener`).
  const requested = useRef(false)
  const opener = useRef<"chip" | "auto">("auto")
  const titleId = useId()
  const offer = update?.offer
  const installing = offer?.kind === "ready" && pressed === offer.version
  const visible = (update?.open ?? false) && !hidden && !update?.blocked && !installing
  const key = offer && updateKey(offer)
  const onShown = update?.onShown
  useEffect(() => {
    if (visible && key !== undefined) onShown?.(key)
  }, [visible, key, onShown])
  useEffect(() => {
    if (!visible || !requested.current) return
    requested.current = false
    panel.current?.querySelector("button")?.focus()
  }, [visible])
  // Opening the subscriptions' detail closes the notice, so the two never overlap.
  const close = update?.onOpenChange
  useEffect(() => {
    if (!visible) return undefined
    const onClick = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest(".footer-usage-pill"))
        close?.(false)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [visible, close])
  const word = offer?.kind === "available" ? "Update available" : "Update ready"
  const finish = (to: Return): void => {
    if (!update) return
    const inside = panel.current?.contains(document.activeElement) === true
    const back = to === "origin" && opener.current === "chip"
    requested.current = false
    opener.current = "auto"
    update.onOpenChange(false)
    if (!inside) return
    if (back) chip.current?.focus()
    else update.returnFocus()
  }
  return (
    <>
      {/* Always mounted, so filling it announces the arrival; out of the layout, and kept
          for assistive technology where the visible words are dropped to fit. */}
      <span role="status" aria-live="polite" className="sr-only">
        {offer ? (installing ? "Restarting to update" : word) : ""}
      </span>
      {update && offer && (
        <>
          <button
            ref={chip}
            type="button"
            className="footer-action footer-update cursor-pointer font-bold"
            aria-label={`${word}: Novadeck ${offer.version}`}
            aria-expanded={visible}
            disabled={installing}
            onClick={() => {
              if (visible) {
                finish("origin")
                return
              }
              requested.current = true
              opener.current = "chip"
              update.onOpenChange(true)
            }}
          >
            {installing ? (
              "Restarting…"
            ) : (
              <>
                <span className="max-[701px]:hidden">{word}</span>
                <span className="hidden max-[701px]:inline">Update</span>
              </>
            )}
          </button>
          {visible && (
            <section
              ref={panel}
              aria-labelledby={titleId}
              className="floating update-panel"
              // Its keys and clicks are its own: the workspace's shortcuts leave them alone.
              data-own-keys
              // A click on its buttons leaves focus where it was, in a terminal.
              onMouseDown={(event) => {
                if (event.target instanceof Element && event.target.closest("button"))
                  event.preventDefault()
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                event.preventDefault()
                event.stopPropagation()
                finish("origin")
              }}
            >
              <UpdateCard
                offer={offer}
                titleId={titleId}
                onClose={finish}
                onRestart={() => {
                  if (pressed === offer.version) return
                  setPressed(offer.version)
                  update.onInstall()
                }}
                onOpenPage={update.onOpenPage}
              />
            </section>
          )}
        </>
      )}
    </>
  )
}
