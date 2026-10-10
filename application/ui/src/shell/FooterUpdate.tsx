import { useEffect, useState } from "react"

import { updateKey, type UpdateOffer } from "../model/update"
import { Popover } from "../ui-toolkit/Popover"

// The release-note lines the popover shows; the release page has the rest.
export const shownNotes = 5

// What the popover says of an offer.
const headline = ({ kind, version }: UpdateOffer): string =>
  `Novadeck ${version} is ${kind === "ready" ? "ready" : "available"}`

// An update waiting beside the footer's status: a chip, "Update ready" or "Update
// available", and the popover that opens from it. The popover is a notice, not a
// dialog: it never takes focus, so typing in a terminal goes on, and only Later, Escape
// from inside it, or its actions close it. Raised once per version (`open`), it waits
// while the footer is hidden, and the chip opens it again.
export type FooterUpdateProps = {
  readonly offer: UpdateOffer
  // Whether the popover is raised: it shows only while the footer does.
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  // Called with the offer's `updateKey` when the popover comes up.
  readonly onShown: (key: string) => void
  // Restarts into a downloaded update.
  readonly onInstall: () => void
  // Opens the update's release page.
  readonly onOpenPage: () => void
}

// The popover's content: the headline, a few notes, and what the person can do.
const UpdateCard = ({
  offer,
  onClose,
  onRestart,
  onOpenPage,
}: {
  readonly offer: UpdateOffer
  readonly onClose: () => void
  readonly onRestart: () => void
  readonly onOpenPage: () => void
}): React.JSX.Element => {
  const { kind, notes } = offer
  const more = notes.length - shownNotes
  return (
    <div
      className="update-card"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.stopPropagation()
        onClose()
      }}
    >
      <h2 className="update-title">{headline(offer)}</h2>
      {notes.length > 0 && (
        <ul className="update-notes">
          {notes.slice(0, shownNotes).map((note, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- Lines may repeat; the list never reorders.
            <li key={index}>{note}</li>
          ))}
          {more > 0 && <li className="update-more">and {more} more</li>}
        </ul>
      )}
      {kind === "ready" && (
        <button type="button" className="button link update-link" onClick={onOpenPage}>
          Release notes
        </button>
      )}
      <div className="update-actions">
        <button type="button" className="button min-h-8 px-3" onClick={onClose}>
          Later
        </button>
        <button
          type="button"
          className="button primary min-h-8 px-3"
          onClick={() => {
            onClose()
            if (kind === "ready") onRestart()
            else onOpenPage()
          }}
        >
          {kind === "ready" ? "Restart now" : "Download"}
        </button>
      </div>
    </div>
  )
}

export const FooterUpdate = ({
  update,
  hidden,
}: {
  readonly update: FooterUpdateProps | undefined
  readonly hidden: boolean
}): React.JSX.Element => {
  // The version the person pressed Restart for: a newer one is a new offer, not pending.
  const [pressed, setPressed] = useState<string>()
  const offer = update?.offer
  const installing = offer?.kind === "ready" && pressed === offer.version
  const visible = (update?.open ?? false) && !hidden && !installing
  const key = offer && updateKey(offer)
  const onShown = update?.onShown
  useEffect(() => {
    if (visible && key !== undefined) onShown?.(key)
  }, [visible, key, onShown])
  const word = offer?.kind === "available" ? "Update available" : "Update ready"
  return (
    <>
      {/* Always mounted, so filling it announces the arrival; out of the layout, and kept
          for assistive technology where the visible words are dropped to fit. */}
      <span role="status" aria-live="polite" className="sr-only">
        {offer ? (installing ? "Restarting to update" : word) : ""}
      </span>
      {update && offer && (
        <Popover
          label={headline(offer)}
          open={visible}
          onOpenChange={update.onOpenChange}
          placement="top-end"
          className="update-popover"
          passive
          trigger={
            <button
              type="button"
              className="footer-action footer-update cursor-pointer font-bold"
              aria-label={`${word}: Novadeck ${offer.version}`}
              disabled={installing}
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
          }
        >
          <UpdateCard
            offer={offer}
            onClose={() => update.onOpenChange(false)}
            onRestart={() => {
              setPressed(offer.version)
              update.onInstall()
            }}
            onOpenPage={update.onOpenPage}
          />
        </Popover>
      )}
    </>
  )
}
